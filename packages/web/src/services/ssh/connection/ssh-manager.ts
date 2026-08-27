/**
 * SSH 连接管理器：以 sessionId 为 key 维护内存态连接，负责建立 / 断开 / 查询会话
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { Client, type ConnectConfig } from "ssh2";

/** 认证方式枚举（决策记录 D4） */
export type AuthType = "password" | "privateKey" | "systemKey" | "agent";

/** 建立 SSH 连接所需的完整配置（凭据已由上层解密，本模块不接触加密存储） */
export interface ConnectionOptions {
	/** 数据库中的连接记录 ID，用于审计与状态关联 */
	connectionId: number;
	host: string;
	port: number;
	username: string;
	authType: AuthType;
	/** 密码认证的明文密码 */
	password?: string;
	/** 私钥内容（privateKey 为粘贴、systemKey 为上层实时读取的文件内容） */
	privateKey?: string;
	/** 私钥 passphrase */
	passphrase?: string;
	/** SSH Agent 转发使用的 socket 路径（缺省时自动探测常见路径） */
	agent?: string;
	/** PTY 终端类型，如 xterm-256color */
	term?: string;
	/** 生产环境标记，影响 Policy Engine 规则集 */
	isProduction?: boolean;
	/** AI 操作开关 */
	aiEnabled?: boolean;
}

/** 一条 SSH 连接，一个桌面 Tab 对应一条 */
export interface SshSession {
	sessionId: string;
	connectionId: number;
	client: Client;
	host: string;
	port: number;
	username: string;
	createdAt: number;
	isProduction: boolean;
	aiEnabled: boolean;
}

/** SSH 连接不存在或已断开 */
export class SshSessionError extends Error {
	constructor(sessionId: string) {
		super(`SSH 会话不存在或已断开: ${sessionId}`);
		this.name = "SshSessionError";
	}
}

/** macOS 从 Dock/Finder 启动时不继承 shell 环境，兜底探测常见 agent socket 路径 */
function resolveAgentSocket(explicit?: string): string | undefined {
	if (explicit) return explicit;
	if (process.env.SSH_AUTH_SOCK) return process.env.SSH_AUTH_SOCK;
	const candidates = [
		"/var/run/com.apple.socket.ssh-agent",
		`${homedir()}/.gnupg/S.gpg-agent.ssh`,
	];
	return candidates.find((path) => existsSync(path));
}

/** 把业务连接配置转成 ssh2 ConnectConfig（docs 技术架构 §4.4） */
function toConnectConfig(opts: ConnectionOptions): ConnectConfig {
	const config: ConnectConfig = {
		host: opts.host,
		port: opts.port,
		username: opts.username,
		readyTimeout: 10_000,
	};
	switch (opts.authType) {
		case "password":
			config.password = opts.password;
			break;
		case "privateKey":
		case "systemKey":
			config.privateKey = opts.privateKey;
			if (opts.passphrase) config.passphrase = opts.passphrase;
			break;
		case "agent":
			config.agent = resolveAgentSocket(opts.agent);
			break;
	}
	return config;
}

export class SshManager {
	private sessions = new Map<string, SshSession>();

	/** 建立 SSH 连接并登记会话；认证失败抛 ssh2 原始错误 */
	async connect(opts: ConnectionOptions): Promise<SshSession> {
		const client = new Client();
		await new Promise<void>((resolve, reject) => {
			const onError = (err: Error) => {
				client.destroy();
				reject(err);
			};
			const onReady = () => {
				client.off("error", onError);
				resolve();
			};
			client.once("ready", onReady);
			client.once("error", onError);
			client.connect(toConnectConfig(opts));
		});

		const session: SshSession = {
			sessionId: randomUUID(),
			connectionId: opts.connectionId,
			client,
			host: opts.host,
			port: opts.port,
			username: opts.username,
			createdAt: Date.now(),
			isProduction: opts.isProduction ?? false,
			aiEnabled: opts.aiEnabled ?? true,
		};
		this.sessions.set(session.sessionId, session);

		// 连接建立后保持持久监听：error 兜底避免无监听崩溃（ssh2 无 error 监听时会 throw），
		// close 事件触发时自动清理会话，避免断连后残留死会话
		client.on("error", () => {});
		client.on("close", () => {
			this.sessions.delete(session.sessionId);
		});
		return session;
	}

	/** 断开连接并从会话表移除 */
	disconnect(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.sessions.delete(sessionId);
		session.client.end();
	}

	/** 查询会话，不存在抛 SshSessionError */
	get(sessionId: string): SshSession {
		const session = this.sessions.get(sessionId);
		if (!session) throw new SshSessionError(sessionId);
		return session;
	}

	/** 列出全部活跃会话 */
	list(): SshSession[] {
		return [...this.sessions.values()];
	}

	/** 会话是否已建立 */
	has(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}
}
