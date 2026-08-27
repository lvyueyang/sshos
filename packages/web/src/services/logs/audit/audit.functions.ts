/** 结构化日志查询 SFn。 */

import { createServerFn } from "@tanstack/react-start";
import { listLogsSchema } from "../storage/logs.schemas";
import { listLogs } from "../storage/logs.server";

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
