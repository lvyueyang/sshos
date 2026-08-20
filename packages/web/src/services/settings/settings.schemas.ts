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
