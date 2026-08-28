/** 终端命令记录 SFn。 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/middleware/auth-guard";
import { recordTerminalCommandSchema } from "./terminal.schemas";
import { recordTerminalCommand } from "./terminal.server";

/** 记录终端交互命令（客户端命令追踪器调用，action=user_input） */
export const recordTerminalCommandSFn = createServerFn({ method: "POST" })
	.validator(recordTerminalCommandSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		recordTerminalCommand(data.sessionId, data.command);
		return { ok: true };
	});
