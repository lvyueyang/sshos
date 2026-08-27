/**
 * 日志查询 / 记录 SFn 入参 Zod schema（单一来源）。
 * type / classification 枚举与 db/schema.ts 的 log 表保持一致。
 */

import { z } from "zod";

/** log 表 type 枚举 */
export const logTypeSchema = z.enum([
	"ai_audit",
	"terminal_command",
	"policy_decision",
]);

/** 与 Policy Engine 三级命名一致 */
export const logClassificationSchema = z.enum(["safe", "review", "block"]);

/** 日志查询（AI 审计历史 / 终端命令追踪 / 策略决策，倒序分页） */
export const listLogsSchema = z.object({
	/** 按会话过滤（AI 审计历史按 sessionId 查询） */
	sessionId: z.string().optional(),
	/** 按连接过滤 */
	connectionId: z.number().int().positive().optional(),
	/** type 过滤（默认全部；传空数组视为不限制） */
	types: z.array(logTypeSchema).max(3).optional(),
	classification: logClassificationSchema.optional(),
	limit: z.number().int().min(1).max(200).default(50),
	offset: z.number().int().min(0).default(0),
});

export type ListLogsInput = z.infer<typeof listLogsSchema>;
