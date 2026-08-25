/**
 * 日志 SFn（docs 技术架构 §7.8）：listLogsSFn 查询结构化日志（审计历史 / 终端命令 / 策略决策），
 * recordTerminalCommandSFn 记录终端交互命令（terminal_command）。两者为查询 / 记录类操作，不挂策略引擎。
 */

import { createServerFn } from "@tanstack/react-start";
import { listLogsSchema, recordTerminalCommandSchema } from "./logs.schemas";
import { listLogs, recordTerminalCommand } from "./logs.server";

/** 查询结构化日志（时间倒序 + 分页；timestamp 序列化为 ISO 字符串） */
export const listLogsSFn = createServerFn({ method: "GET" })
	.validator(listLogsSchema)
	.handler(async ({ data }) => {
		const rows = await listLogs(data);
		return rows.map((r) => ({
			id: r.id,
			type: r.type,
			sessionId: r.sessionId,
			connectionId: r.connectionId,
			command: r.command,
			classification: r.classification,
			action: r.action,
			result: r.result,
			detail: r.detail,
			timestamp: r.timestamp.toISOString(),
		}));
	});

/** 记录终端交互命令（客户端命令追踪器调用，action=user_input） */
export const recordTerminalCommandSFn = createServerFn({ method: "POST" })
	.validator(recordTerminalCommandSchema)
	.handler(async ({ data }) => {
		recordTerminalCommand(data.sessionId, data.command);
		return { ok: true };
	});
