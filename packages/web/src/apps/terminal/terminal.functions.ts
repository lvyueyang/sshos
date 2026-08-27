/**
 * terminal 应用 SFn 包装（docs 技术架构 §5.4）：
 * connect / createPty / sendInput（不挂策略）/ resizePty / disconnect。
 * 纯 SSH 逻辑在 services/ssh/connection/ssh.server.ts。
 */

import { createServerFn } from "@tanstack/react-start";
import {
	connectSession,
	disconnectSession,
	ptyManager,
	sshManager,
} from "#/services/ssh/connection/ssh.server";
import {
	closePtySchema,
	connectSchema,
	createPtySchema,
	disconnectSchema,
	ptyStreamSchema,
	resizePtySchema,
	sendInputSchema,
} from "./terminal.schemas";

/** 建立 SSH 连接（解密凭据），返回 sessionId 与会话摘要 */
export const connectSFn = createServerFn({ method: "POST" })
	.validator(connectSchema)
	.handler(async ({ data }) => {
		const session = await connectSession(data.connectionId);
		return {
			sessionId: session.sessionId,
			host: session.host,
			username: session.username,
		};
	});

/** 创建 PTY 会话，返回 ptyId */
export const createPtySFn = createServerFn({ method: "POST" })
	.validator(createPtySchema)
	.handler(async ({ data }) => {
		const session = sshManager.get(data.sessionId);
		const pty = await ptyManager.create(session.client, {
			sessionId: session.sessionId,
			cols: data.cols,
			rows: data.rows,
		});
		return { ptyId: pty.ptyId };
	});

/** 发送键盘输入（逐键流不挂策略，见 docs 技术架构 §5.3） */
export const sendInputSFn = createServerFn({ method: "POST" })
	.validator(sendInputSchema)
	.handler(async ({ data }) => {
		ptyManager.get(data.ptyId).channel.write(data.data);
		return { ok: true };
	});

/** 调整终端尺寸 */
export const resizePtySFn = createServerFn({ method: "POST" })
	.validator(resizePtySchema)
	.handler(async ({ data }) => {
		ptyManager.resize(data.ptyId, data.cols, data.rows);
		return { ok: true };
	});

/** 关闭 PTY 会话（终端窗口卸载时销毁，避免重开复用已断流的 pty） */
export const closePtySFn = createServerFn({ method: "POST" })
	.validator(closePtySchema)
	.handler(async ({ data }) => {
		ptyManager.destroy(data.ptyId);
		return { ok: true };
	});

/** PTY 输出流：返回文本 ReadableStream，客户端逐块解码（SFn 流式） */
export const ptyStreamSFn = createServerFn({ method: "GET" })
	.validator(ptyStreamSchema)
	.handler(async ({ data }) => {
		const { Readable } = await import("node:stream");
		// 单终端 spike：取该会话当前 pty；多终端时客户端传 ptyId 精确订阅
		const pty = ptyManager.getBySession(data.sessionId);
		if (!pty) throw new Error("PTY 会话不存在");
		return Readable.toWeb(pty.output) as ReadableStream<Uint8Array>;
	});

/** 断开 SSH 连接 */
export const disconnectSFn = createServerFn({ method: "POST" })
	.validator(disconnectSchema)
	.handler(async ({ data }) => {
		disconnectSession(data.sessionId);
		return { ok: true };
	});
