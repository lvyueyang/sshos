/**
 * PTY 会话管理器：在同一 SSH 连接上创建独立 shell channel，输出经 Node 流推送
 */

import { randomUUID } from "node:crypto";
import { type Duplex, PassThrough } from "node:stream";
import type { Client, ClientChannel } from "ssh2";

/** PTY 会话：输出经 Node 流暴露，供 Server Route 转 Web ReadableStream 推送 */
export interface PtySession {
	ptyId: string;
	/** 所属 SSH 会话 */
	sessionId: string;
	channel: ClientChannel;
	/** PTY 输出流（UTF-8 字节流） */
	output: Duplex;
}

/** 创建 PTY 会话的参数 */
export interface PtyCreateOptions {
	sessionId: string;
	cols?: number;
	rows?: number;
	/** 终端类型，默认 xterm-256color */
	term?: string;
}

export class PtySessionError extends Error {
	constructor(ptyId: string) {
		super(`PTY 会话不存在或已关闭: ${ptyId}`);
		this.name = "PtySessionError";
	}
}

export class PtyManager {
	private sessions = new Map<string, PtySession>();

	/** 在给定连接上打开 PTY shell；channel 关闭时自动清理会话 */
	create(client: Client, opts: PtyCreateOptions): Promise<PtySession> {
		return new Promise((resolve, reject) => {
			const ptyId = randomUUID();
			client.shell(
				{
					term: opts.term ?? "xterm-256color",
					cols: opts.cols ?? 80,
					rows: opts.rows ?? 24,
				},
				(err, channel) => {
					if (err) {
						reject(err);
						return;
					}
					const output = new PassThrough();
					channel.stdout.pipe(output);
					// error 兜底：channel 中断（连接断开）时若无监听会导致未捕获异常
					channel.on("error", () => {});
					channel.on("close", () => {
						output.end();
						this.sessions.delete(ptyId);
					});
					const pty: PtySession = {
						ptyId,
						sessionId: opts.sessionId,
						channel,
						output,
					};
					this.sessions.set(ptyId, pty);
					resolve(pty);
				},
			);
		});
	}

	/** 向 PTY 写入键盘输入（UTF-8 字符串） */
	write(ptyId: string, data: string): void {
		this.get(ptyId).channel.write(data);
	}

	/** 调整终端尺寸（ssh2 setWindow 签名要求像素高宽，终端场景传 0 表示不更新） */
	resize(ptyId: string, cols: number, rows: number): void {
		this.get(ptyId).channel.setWindow(rows, cols, 0, 0);
	}

	/** 关闭 PTY 会话 */
	destroy(ptyId: string): void {
		const pty = this.sessions.get(ptyId);
		if (!pty) return;
		this.sessions.delete(ptyId);
		pty.channel.close();
		pty.output.end();
	}

	/** 查询 PTY 会话，不存在抛 PtySessionError */
	get(ptyId: string): PtySession {
		const pty = this.sessions.get(ptyId);
		if (!pty) throw new PtySessionError(ptyId);
		return pty;
	}
}

/**
 * 全局 PTY 管理器单例（跨 dev 多环境 / HMR / 打包 chunk 共享）。
 * 挂 globalThis（对齐 bootstrap/status.ts 的模式）：dev 下 SFn（ssr 环境）与
 * WebSocket 网关（nitro 环境）各自加载本模块，若不共享实例则 PTY 会话状态分裂。
 */
const GLOBAL_KEY = "__SSHOS_PTY_MANAGER__";

export function getPtyManager(): PtyManager {
	const g = globalThis as Record<string, unknown>;
	const existing = g[GLOBAL_KEY];
	if (existing) return existing as PtyManager;
	const manager = new PtyManager();
	g[GLOBAL_KEY] = manager;
	return manager;
}
