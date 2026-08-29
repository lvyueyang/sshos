/**
 * SSH 领域服务：连接生命周期（基于 services/ssh 的 SshManager / PtyManager）。
 * 从数据库连接记录组装 ConnectionOptions，支持四种认证方式（决策记录 D4）。
 * 凭据明文存储（决策记录 D23），直接读取。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { approvalRegistry } from "#/services/ai/approval/registry";
import { clearDistroProfile } from "#/services/capabilities/distro/distro-profile";
import { clearToolCache } from "#/services/capabilities/tools/cache";
import { getConnection } from "../../settings/connections/settings.server";
import { getPtyManager } from "../pty/pty-manager";
import { clearPtyTicketsBySession } from "../pty/ticket";
import {
	type ConnectionOptions,
	getSshManager,
	type SshSession,
} from "./ssh-manager";

export const sshManager = getSshManager();
export const ptyManager = getPtyManager();

/** 展开 ~ 为家目录 */
function expandHome(p: string): string {
	return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/** systemKey 模式：实时读取系统密钥文件内容，不复制到数据库 */
function readSystemKey(privateKeyPath?: string | null): string | undefined {
	if (!privateKeyPath) return undefined;
	return readFileSync(expandHome(privateKeyPath), "utf-8");
}

/** 从数据库连接记录组装 ConnectionOptions（凭据直读明文） */
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
		password: conn.password ?? undefined,
		privateKey:
			conn.authType === "systemKey"
				? readSystemKey(conn.privateKeyPath)
				: (conn.privateKey ?? undefined),
		passphrase: conn.passphrase ?? undefined,
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

/** 建立连接：查询连接配置 → 组装 ConnectionOptions → ssh2 连接并登记会话。
 *  幂等接管（决策记录「会话接管与空闲回收」）：该 connectionId 已有存活会话时直接复用，不新建。 */
const connectInFlight = new Map<number, Promise<SshSession>>();

export async function connectSession(
	connectionId: number,
): Promise<SshSession> {
	// 该 connectionId 已有存活会话时直接复用
	const existing = sshManager.findByConnectionId(connectionId);
	if (existing) return existing;
	// 单飞：同一 connectionId 并发建连共享同一 Promise，避免 check-then-act 竞态建出双会话
	const pending = connectInFlight.get(connectionId);
	if (pending) return pending;
	const promise = (async () => {
		const conn = await getConnection(connectionId);
		return sshManager.connect(toConnectionOptions(conn));
	})();
	connectInFlight.set(connectionId, promise);
	try {
		return await promise;
	} finally {
		connectInFlight.delete(connectionId);
	}
}

/** 心跳续租：会话存在则刷新 lastHeartbeatAt；返回会话是否存活（客户端据 alive 决定降级重连） */
export function touchSession(sessionId: string): boolean {
	return sshManager.touch(sessionId);
}

/** 断开连接并清理（同步清空该会话的审批挂起项，docs 技术架构 §7.3；同时清理发行版 Profile / 工具探测缓存 / WS 握手票据） */
export function disconnectSession(sessionId: string): void {
	sshManager.disconnect(sessionId);
	approvalRegistry.clearBySession(sessionId);
	clearDistroProfile(sessionId);
	clearToolCache(sessionId);
	clearPtyTicketsBySession(sessionId);
}

// 会话空闲 TTL 与清扫间隔（决策记录「会话接管与空闲回收」：刷新靠接管、关页靠 TTL）
const SESSION_IDLE_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// 定时器句柄放 globalThis：开发期 HMR 重载模块时不会叠加第二个 interval
const SWEEPER_KEY = "__sshOsSessionSweeperTimer";
const globalState = globalThis as {
	[SWEEPER_KEY]?: ReturnType<typeof setInterval>;
};

/** 启动会话空闲 TTL 清扫（幂等；孤儿会话由服务端定时回收，不依赖浏览器卸载事件） */
export function startSessionSweeper(): void {
	if (globalState[SWEEPER_KEY]) return;
	const timer = setInterval(() => {
		for (const session of sshManager.sweepExpired(SESSION_IDLE_TTL_MS)) {
			// 复用 disconnectSession 统一走审批挂起 / Profile / 工具缓存清理
			disconnectSession(session.sessionId);
		}
	}, SWEEP_INTERVAL_MS);
	timer.unref?.();
	globalState[SWEEPER_KEY] = timer;
}

/** 停止清扫（优雅退出 / 测试清理用） */
export function stopSessionSweeper(): void {
	const timer = globalState[SWEEPER_KEY];
	if (timer) clearInterval(timer);
	globalState[SWEEPER_KEY] = undefined;
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
