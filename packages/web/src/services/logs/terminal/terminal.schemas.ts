/** 终端交互命令 SFn 入参校验。 */

import { z } from "zod";

/** 终端命令记录（客户端命令追踪器回调，落 terminal_command 类日志）。 */
export const recordTerminalCommandSchema = z.object({
	sessionId: z.string().min(1),
	command: z.string().min(1).max(2048),
});
