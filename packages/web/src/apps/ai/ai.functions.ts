/**
 * ai 应用 SFn（docs 技术架构 §7.7）：execCommandSFn 非交互式命令执行。
 * 策略检查 / 审计统一走 exec.service（execWithPolicy），SFn 仅作客户端调用入口。
 * AI 对话走 Server Route（routes/api/ai.chat.tsx），见 ai.chat.server.ts。
 */

import { createServerFn } from "@tanstack/react-start";
import { execCommandSchema } from "./ai.schemas";

/** 非交互式命令执行：策略在 exec.service（block/review/safe），SFn 为包装 */
export const execCommandSFn = createServerFn({ method: "POST" })
	.validator(execCommandSchema)
	.handler(async ({ data }) => {
		const { execWithPolicy } = await import("#/services/ssh/exec.service");
		const stdout = await execWithPolicy(data.sessionId, data.command);
		return { stdout };
	});
