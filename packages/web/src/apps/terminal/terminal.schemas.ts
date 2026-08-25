/**
 * terminal 应用 SFn 入参出参 Zod schema（单一来源，服务层用 z.infer 派生）
 */

import { z } from "zod";

/** 建立 SSH 连接 */
export const connectSchema = z.object({
	connectionId: z.number().int().positive(),
});

export type ConnectInput = z.infer<typeof connectSchema>;

/** 创建 PTY 会话（每个终端窗口一个 channel） */
export const createPtySchema = z.object({
	sessionId: z.string().min(1),
	cols: z.number().int().min(1).default(80),
	rows: z.number().int().min(1).default(24),
});

/** 发送键盘输入（逐键流，不挂策略——docs 技术架构 §5.3） */
export const sendInputSchema = z.object({
	ptyId: z.string().min(1),
	data: z.string(),
});

/** 调整终端尺寸 */
export const resizePtySchema = z.object({
	ptyId: z.string().min(1),
	cols: z.number().int().min(1),
	rows: z.number().int().min(1),
});

/** 关闭 PTY 会话 */
export const closePtySchema = z.object({
	ptyId: z.string().min(1),
});

/** 订阅 PTY 输出流（SFn 流式返回 ReadableStream） */
export const ptyStreamSchema = z.object({
	sessionId: z.string().min(1),
});

/** 断开 SSH 连接 */
export const disconnectSchema = z.object({
	sessionId: z.string().min(1),
});
