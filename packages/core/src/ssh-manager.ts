/**
 * SSH 连接管理器：以 sessionId 为 key 维护内存态连接，负责建立 / 断开 / 查询会话
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { Client, type ConnectConfig } from "ssh2";
import type { ConnectionOptions, SshSession } from "./types";

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
