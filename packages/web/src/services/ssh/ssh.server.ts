/**
 * SSH 领域服务：连接生命周期（基于 @sshos/core SshManager）。
 * 从数据库连接记录解密凭据组装 ConnectionOptions，支持四种认证方式（决策记录 D4）。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type ConnectionOptions,
	clearDistroProfile,
	PtyManager,
	SshManager,
	type SshSession,
} from "@sshos/core";
import { approvalRegistry } from "#/approval/registry";
import { clearToolCache } from "#/services/capabilities/cache";
import { decryptCredential, getConnection } from "../settings/settings.server";

export const sshManager = new SshManager();
export const ptyManager = new PtyManager();

/** 展开 ~ 为家目录 */
function expandHome(p: string): string {
	return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/** systemKey 模式：实时读取系统密钥文件内容，不复制到数据库 */
function readSystemKey(privateKeyPath?: string | null): string | undefined {
	if (!privateKeyPath) return undefined;
	return readFileSync(expandHome(privateKeyPath), "utf-8");
}

/** 从数据库连接记录组装 ConnectionOptions（凭据解密） */
function toConnectionOptions(
	conn: Awaited<ReturnType<typeof getConnection>>,
): ConnectionOptions {
	if (!conn) throw new Error(`连接配置不存在: connectionId`);
	return {
		connectionId: conn.id,
		host: conn.host,
		port: conn.port ?? 22,
		username: conn.username,
		authType: conn.authType,
		password: decryptCredential(conn.passwordEnc),
		privateKey:
			conn.authType === "systemKey"
				? readSystemKey(conn.privateKeyPath)
				: decryptCredential(conn.privateKeyEnc),
		passphrase: decryptCredential(conn.passphraseEnc),
		term: conn.term ?? "xterm-256color",
		isProduction: Boolean(conn.isProduction),
		aiEnabled: conn.aiEnabled !== 0,
	};
}

/** 连接测试入参（表单填写中的明文配置） */
export interface TestConnectionInput {
	host: string;
	port?: number;
	username: string;
	authType: ConnectionOptions["authType"];
	password?: string;
	privateKey?: string;
	privateKeyPath?: string;
	passphrase?: string;
}

/** 由测试入参组装 ConnectionOptions（connectionId 用 0 占位，测试后即断开不落会话） */
function toTestConnectionOptions(
	input: TestConnectionInput,
): ConnectionOptions {
	return {
		connectionId: 0,
		host: input.host,
		port: input.port ?? 22,
		username: input.username,
		authType: input.authType,
		password: input.password,
		privateKey:
			input.authType === "systemKey"
				? readSystemKey(input.privateKeyPath)
				: input.privateKey,
		passphrase: input.passphrase,
	};
}

/** 在会话上执行命令并返回 stdout（metrics 采集复用） */
export function execCommand(
	sessionId: string,
	command: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const session = sshManager.get(sessionId);
		session.client.exec(command, (err, channel) => {
			if (err) {
				reject(err);
				return;
			}
			let output = "";
			channel.on("data", (chunk: Buffer) => {
				output += chunk.toString();
			});
			channel.stderr?.on("data", () => {
				// 只读 exec 忽略 stderr
			});
			channel.on("close", () => resolve(output));
			channel.on("error", (channelErr: Error) => reject(channelErr));
		});
	});
}

/** 测试连接：连接成功返回系统信息，失败返回错误消息（5s 超时兜底） */
export async function testConnection(
	input: TestConnectionInput,
): Promise<{ ok: true; os?: string } | { ok: false; message: string }> {
	let session: SshSession | undefined;
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(() => reject(new Error("连接超时")), 5_000),
	);
	try {
		session = await Promise.race([
			sshManager.connect(toTestConnectionOptions(input)),
			timeout,
		]);
		let os: string | undefined;
		try {
			os = (await execCommand(session.sessionId, "uname -sr")).trim();
		} catch {
			// 拿不到 OS 信息不影响测试成功
		}
		return { ok: true, os };
	} catch (err) {
		return {
			ok: false,
			message: err instanceof Error ? err.message : String(err),
		};
	} finally {
		if (session) sshManager.disconnect(session.sessionId);
	}
}

/** 建立连接：查询连接配置 → 解密凭据 → ssh2 连接并登记会话 */
export async function connectSession(
	connectionId: number,
): Promise<SshSession> {
	const conn = await getConnection(connectionId);
	const session = await sshManager.connect(toConnectionOptions(conn));
	return session;
}

/** 断开连接并清理（同步清空该会话的审批挂起项，docs 技术架构 §7.3；同时清理发行版 Profile / 工具探测缓存） */
export function disconnectSession(sessionId: string): void {
	sshManager.disconnect(sessionId);
	approvalRegistry.clearBySession(sessionId);
	clearDistroProfile(sessionId);
	clearToolCache(sessionId);
}

/** 按会话查询是否生产环境（策略引擎用，服务端权威来源） */
export async function resolveIsProduction(
	sessionId: string | undefined,
): Promise<boolean> {
	if (!sessionId) return false;
	try {
		return sshManager.get(sessionId).isProduction;
	} catch {
		return false;
	}
}

/** 扫描系统密钥文件（~/.ssh 下非 .pub / 非配置文件） */
export function scanSystemKeys(): string[] {
	const sshDir = join(homedir(), ".ssh");
	if (!existsSync(sshDir)) return [];
	const excluded = ["config", "known_hosts", "authorized_keys", "environment"];
	return readdirSync(sshDir)
		.filter((f) => !f.endsWith(".pub") && !excluded.includes(f))
		.map((f) => join("~/.ssh", f));
}
