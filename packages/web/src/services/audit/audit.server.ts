/**
 * 审计日志查询服务（docs 技术架构 §4.3 / §7.8）：结构化日志查询。
 * 查询支持 sessionId / connectionId / type / classification 过滤 + 倒序分页；
 * 终端命令记录由客户端命令追踪器经 SFn 落库（terminal_command 类，action=user_input）。
 * 写入走 audit-writer.server.ts（auditLogWriter 批量落库）。
 */

import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "#/db";
import { log as logTable } from "#/db/schema";
import type { ListLogsInput } from "./audit.schemas";

/** 日志查询条件（可选过滤字段 + 分页） */
export type LogQuery = ListLogsInput;

/** 查询结构化日志（时间倒序 + 分页，AI 审计历史 / 终端命令 / 策略决策共用） */
export async function listLogs(query: LogQuery) {
	const conds: SQL[] = [];
	if (query.sessionId) conds.push(eq(logTable.sessionId, query.sessionId));
	if (query.connectionId)
		conds.push(eq(logTable.connectionId, query.connectionId));
	if (query.types && query.types.length > 0) {
		conds.push(inArray(logTable.type, query.types));
	}
	if (query.classification) {
		conds.push(eq(logTable.classification, query.classification));
	}
	return db
		.select()
		.from(logTable)
		.where(conds.length > 0 ? and(...conds) : undefined)
		.orderBy(desc(logTable.timestamp), desc(logTable.id))
		.limit(query.limit)
		.offset(query.offset);
}
