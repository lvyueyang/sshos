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

/** 对话消息（role 仅 user / assistant，system 由 guardChatInput 拒绝） */
export interface AiChatMessage {
	role: "user" | "assistant";
	content: string;
}

/** AI 对话流帧（SFn 流式 chunk，客户端逐块消费）：
 * text-delta 为正常增量；error 为服务端终止帧（未配置模型 / prompt 失败 / 空响应），
 * 客户端必须展示错误消息而非静默（不吞错） */
export type AiStreamChunk =
	| { type: "text-delta"; delta: string }
	| { type: "error"; message: string };
