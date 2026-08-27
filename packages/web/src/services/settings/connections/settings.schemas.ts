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
	name: z
		.string()
		.trim()
		.min(1)
		.max(30)
		.refine((name) => name !== "默认", {
			message: "默认是保留分组名称",
		}),
	color: z.string().optional(),
});

export const updateGroupSchema = z.object({
	id: z.number().int().positive(),
	name: z
		.string()
		.trim()
		.min(1)
		.max(30)
		.refine((name) => name !== "默认", {
			message: "默认是保留分组名称",
		}),
	color: z.string().optional(),
});

export const deleteGroupSchema = z.object({ id: z.number().int().positive() });

export const reorderGroupsSchema = z.object({
	ids: z.array(z.number().int().positive()).min(1),
});

/** 连接排序与移动；null 表示虚拟默认分组 */
export const reorderConnectionsSchema = z.object({
	groupId: z.number().int().positive().nullable(),
	connectionIds: z.array(z.number().int().positive()),
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

/** 读取全局设置（setting 表，键值 JSON；如 appearance.theme） */
export const getGlobalSettingSchema = z.object({
	key: z.string().min(1),
});

/** 写入全局设置（upsert；value 为 JSON 可序列化值） */
export const setGlobalSettingSchema = z.object({
	key: z.string().min(1),
	value: z.unknown(),
});

/** 系统信息查询（通用设置页展示数据目录等环境信息，无入参） */
export const getSystemInfoSchema = z.object({});

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
