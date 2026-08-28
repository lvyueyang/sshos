/**
 * 审计日志批量写入器（auditLogWriter）：结构化日志（log 表）的写入通道。
 * 底层为 lib/batch-writer 通用 BatchWriter<T>，此处绑定 log 表枚举与 INSERT。
 * 供 AI 审计 / 策略决策 / 终端命令记录共用；查询走 services/audit/audit.server.ts。
 */

import { db } from "#/db";
import { log as logTable } from "#/db/schema";
import { BatchWriter } from "#/lib/batch-writer/batch-writer.server";

/** log 表 action 枚举 */
export type LogAction =
	| "executed"
	| "blocked"
	| "pending_approval"
	| "approved"
	| "rejected"
	| "user_input";
/** log 表 result 枚举 */
export type LogResult = "success" | "failure" | "timeout";

/** 审计日志条目（log 表写入载荷，type 对齐表枚举） */
export interface LogEntry {
	type: "ai_audit" | "terminal_command" | "policy_decision";
	sessionId?: string | null;
	connectionId?: number | null;
	command?: string | null;
	classification?: "safe" | "review" | "block" | null;
	action: LogAction;
	result: LogResult;
	detail?: string | null;
}

/** 审计日志批量写入器（定时 / 定量落库，写入失败退避重试不丢审计） */
export const auditLogWriter = new BatchWriter<LogEntry>({
	logLabel: "审计日志",
	insertFn: async (entries) => {
		await db
			.insert(logTable)
			.values(entries.map((e) => ({ ...e, timestamp: new Date() })));
	},
});
