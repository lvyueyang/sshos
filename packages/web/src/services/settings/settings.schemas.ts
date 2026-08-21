/**
 * 连接 / 分组管理 SFn 入参出参 Zod schema（单一来源）
 */

import { z } from "zod";

/** 连接表单输入（敏感字段为明文，入库前服务端加密） */
export const connectionInputSchema = z.object({
	title: z.string().min(2).max(30),
	host: z.string().min(1),
	port: z.number().int().min(1).max(65535).default(22),
	username: z.string().min(1),
	authType: z.enum(["password", "privateKey", "systemKey", "agent"]),
	password: z.string().optional(),
	privateKey: z.string().optional(),
	privateKeyPath: z.string().optional(),
	passphrase: z.string().optional(),
	groupId: z.number().int().nullable().optional(),
	color: z.string().optional(),
	isProduction: z.boolean().default(false),
	aiEnabled: z.boolean().default(true),
});

export type ConnectionInput = z.infer<typeof connectionInputSchema>;

/** 更新连接（字段可选，未提供的敏感字段保持原值） */
export const updateConnectionSchema = z.object({
	id: z.number().int().positive(),
	input: connectionInputSchema.partial(),
});

/** 删除连接 */
export const deleteConnectionSchema = z.object({
	id: z.number().int().positive(),
});

/** 新建分组 */
export const createGroupSchema = z.object({
	name: z.string().min(1),
	color: z.string().optional(),
});

/** 测试连接 */
export const testConnectionSchema = connectionInputSchema.pick({
	host: true,
	port: true,
	username: true,
	authType: true,
	password: true,
	privateKey: true,
	privateKeyPath: true,
	passphrase: true,
});

/** 可序列化的 JSON 值（App 会话状态 / 桌面布局快照的存储形态） */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/** 读取每连接配置（App 框架 settings 网关） */
export const getConnectionSettingSchema = z.object({
	connectionId: z.number().int().positive(),
	key: z.string().min(1),
});

/** 写入每连接配置（App 框架 settings 网关，onSave 产物） */
export const setConnectionSettingSchema = z.object({
	connectionId: z.number().int().positive(),
	key: z.string().min(1),
	value: z.unknown(),
});

/** App 框架审计记录（ctx.audit.record，落 ai_audit 类日志） */
export const recordAuditSchema = z.object({
	sessionId: z.string(),
	command: z.string().max(2048),
	classification: z.enum(["safe", "review", "block"]).optional(),
	action: z
		.enum([
			"executed",
			"blocked",
			"pending_approval",
			"approved",
			"rejected",
			"user_input",
		])
		.optional(),
	result: z.enum(["success", "failure", "timeout"]).optional(),
});
