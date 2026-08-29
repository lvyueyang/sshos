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
	/** 最近一次心跳时间（客户端续租，空闲 TTL 清扫依据，决策记录「会话接管与空闲回收」） */
	lastHeartbeatAt: number;
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
	/** connectionId → 存活会话的 sessionId（幂等接管索引，一连接一 Tab 至多一个） */
	private byConnectionId = new Map<number, string>();

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
			lastHeartbeatAt: Date.now(),
			isProduction: opts.isProduction ?? false,
			aiEnabled: opts.aiEnabled ?? true,
		};
		this.sessions.set(session.sessionId, session);
		this.byConnectionId.set(opts.connectionId, session.sessionId);

		// 连接建立后保持持久监听：error 兜底避免无监听崩溃（ssh2 无 error 监听时会 throw），
		// close 事件触发时自动清理会话，避免断连后残留死会话
		client.on("error", () => {});
		client.on("close", () => {
			this.sessions.delete(session.sessionId);
			if (this.byConnectionId.get(session.connectionId) === session.sessionId) {
				this.byConnectionId.delete(session.connectionId);
			}
		});
		return session;
	}

	/** 断开连接并从会话表移除（同步清理 connectionId 索引） */
	disconnect(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		this.sessions.delete(sessionId);
		if (this.byConnectionId.get(session.connectionId) === sessionId) {
			this.byConnectionId.delete(session.connectionId);
		}
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

	/** 按 connectionId 查存活会话（幂等接管：一连接一 Tab，至多一个；不存在返回 undefined） */
	findByConnectionId(connectionId: number): SshSession | undefined {
		const sessionId = this.byConnectionId.get(connectionId);
		if (!sessionId) return undefined;
		return this.sessions.get(sessionId);
	}

	/** 心跳续租：刷新 lastHeartbeatAt；会话不存在返回 false */
	touch(sessionId: string, now: number = Date.now()): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		session.lastHeartbeatAt = now;
		return true;
	}

	/** 找出并断开空闲超 TTL 的会话（网络层清理），返回被清理的会话列表 */
	sweepExpired(idleMs: number, now: number = Date.now()): SshSession[] {
		const expired: SshSession[] = [];
		for (const session of this.sessions.values()) {
			if (now - session.lastHeartbeatAt > idleMs) expired.push(session);
		}
		for (const session of expired) this.disconnect(session.sessionId);
		return expired;
	}
}

/**
 * 全局 SSH 连接管理器单例（跨 dev 多环境 / HMR / 打包 chunk 共享）。
 * 挂 globalThis（对齐 pty-manager / bootstrap-status 的模式）：dev 下 SFn（ssr 环境）
 * 与 WebSocket 网关（nitro 环境）各自加载本模块，若不共享实例则会话状态分裂，
 * 终端 / 命令 / 指标将看到互相看不到对方的连接。
 */
const GLOBAL_KEY = "__SSHOS_SSH_MANAGER__";

export function getSshManager(): SshManager {
	const g = globalThis as Record<string, unknown>;
	const existing = g[GLOBAL_KEY];
	if (existing) return existing as SshManager;
	const manager = new SshManager();
	g[GLOBAL_KEY] = manager;
	return manager;
}
