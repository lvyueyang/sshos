/**
 * ai 应用 SFn 入参 Zod schema（单一来源，服务层用 z.infer 派生）。
 * 对话消息校验由 ai.chat.server 的 guardChatInput 承担（role 排除 system）。
 */

import { z } from "zod";

/** 非交互式命令执行（挂审计 + 策略引擎） */
export const execCommandSchema = z.object({
	sessionId: z.string().min(1),
	command: z.string().min(1),
});

/** AI 对话（SFn 流式）：历史消息作为上下文，服务端返回 text-delta 增量流 */
export const aiChatSchema = z.object({
	sessionId: z.string().min(1),
	messages: z.array(
		z.object({
			role: z.enum(["user", "assistant"]),
			content: z.string(),
		}),
	),
});
