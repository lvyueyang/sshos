/**
 * ai 应用 SFn（docs 技术架构 §7.7）：execCommandSFn 非交互式命令执行 +
 * aiChatSFn AI 对话增量流（SFn 流式返回，text-delta 逐块消费）。
 * 策略检查 / 审计统一走 exec.service（execWithPolicy），SFn 仅作客户端调用入口。
 */

import { createServerFn } from "@tanstack/react-start";
import { promptGuardMiddleware } from "#/middleware/prompt-guard";
import { aiChatSchema, execCommandSchema } from "./ai.schemas";

/** 非交互式命令执行：策略在 exec.service（block/review/safe），SFn 为包装 */
export const execCommandSFn = createServerFn({ method: "POST" })
	.validator(execCommandSchema)
	.handler(async ({ data }) => {
		const { execWithPolicy } = await import("#/services/ssh/exec.service");
		const stdout = await execWithPolicy(data.sessionId, data.command);
		return { stdout };
	});

/** AI 对话：返回 ReadableStream<AiTextDelta> 增量流，prompt 注入检测由 promptGuard 承担 */
export const aiChatSFn = createServerFn({ method: "POST" })
	.validator(aiChatSchema)
	.middleware([promptGuardMiddleware])
	.handler(async ({ data }) => {
		const { createAiChatStream } = await import("#/apps/ai/ai.chat.server");
		return createAiChatStream(data.sessionId, data.messages);
	});
