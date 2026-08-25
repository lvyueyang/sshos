/**
 * 日志领域服务（docs 技术架构 §4.3 / §7.8）：结构化日志查询与记录。
 * 查询支持 sessionId / connectionId / type / classification 过滤 + 倒序分页；
 * 终端命令记录由客户端命令追踪器经 SFn 落库（terminal_command 类，action=user_input）。
 */

import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "#/db";
import { log as logTable } from "#/db/schema";
import { batchWriter } from "#/lib/batch-writer";
import { sshManager } from "#/services/ssh/ssh.server";
import type { ListLogsInput } from "./logs.schemas";

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

/** 记录终端交互命令（terminal_command 类；会话不存在时丢弃，防伪造 sessionId 污染审计） */
export function recordTerminalCommand(
	sessionId: string,
	command: string,
): void {
	let connectionId: number;
	try {
		connectionId = sshManager.get(sessionId).connectionId;
	} catch {
		// 会话不存在 / 已断开：丢弃记录（客户端侧已无法归属真实会话）
		return;
	}
	batchWriter.enqueue({
		type: "terminal_command",
		sessionId,
		connectionId,
		command,
		action: "user_input",
		result: "success",
	});
}
