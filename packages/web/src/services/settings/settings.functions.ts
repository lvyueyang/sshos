/**
 * 连接 / 分组管理 SFn（docs 技术架构 §5.4）：
 * 列表 / 查询 / 新建 / 更新 / 删除 / 测试连接。凭据加密在 settings.server 处理。
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { testConnection } from "#/services/ssh/ssh.server";
import {
	connectionInputSchema,
	createGroupSchema,
	deleteConnectionSchema,
	testConnectionSchema,
	updateConnectionSchema,
} from "./settings.schemas";
import {
	createConnection,
	createGroup,
	deleteConnection,
	getConnection,
	listConnections,
	listGroups,
	updateConnection,
} from "./settings.server";

const idSchema = z.object({ id: z.number().int().positive() });

/** 列出全部连接（不含凭据字段） */
export const listConnectionsSFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const rows = await listConnections();
		return rows.map((c) => ({
			id: c.id,
			title: c.title,
			host: c.host,
			port: c.port,
			username: c.username,
			authType: c.authType,
			groupId: c.groupId,
			color: c.color,
			isProduction: Boolean(c.isProduction),
			aiEnabled: c.aiEnabled !== 0,
			lastConnectedAt: c.lastConnectedAt,
		}));
	},
);

/** 列出全部连接分组 */
export const listGroupsSFn = createServerFn({ method: "GET" }).handler(
	async () => listGroups(),
);

/** 查询单个连接（不含凭据字段） */
export const getConnectionSFn = createServerFn({ method: "GET" })
	.validator(idSchema)
	.handler(async ({ data }) => {
		const conn = await getConnection(data.id);
		if (!conn) throw new Error("连接不存在");
		return {
			id: conn.id,
			title: conn.title,
			host: conn.host,
			port: conn.port,
			username: conn.username,
			authType: conn.authType,
			groupId: conn.groupId,
			privateKeyPath: conn.privateKeyPath,
			color: conn.color,
			isProduction: Boolean(conn.isProduction),
			aiEnabled: conn.aiEnabled !== 0,
		};
	});

/** 新建连接，返回连接 ID */
export const createConnectionSFn = createServerFn({ method: "POST" })
	.validator(connectionInputSchema)
	.handler(async ({ data }) => {
		const id = await createConnection(data);
		return { id };
	});

/** 更新连接 */
export const updateConnectionSFn = createServerFn({ method: "POST" })
	.validator(updateConnectionSchema)
	.handler(async ({ data }) => {
		await updateConnection(data.id, data.input);
		return { ok: true };
	});

/** 删除连接 */
export const deleteConnectionSFn = createServerFn({ method: "POST" })
	.validator(deleteConnectionSchema)
	.handler(async ({ data }) => {
		await deleteConnection(data.id);
		return { ok: true };
	});

/** 新建分组 */
export const createGroupSFn = createServerFn({ method: "POST" })
	.validator(createGroupSchema)
	.handler(async ({ data }) => {
		const id = await createGroup(data.name, data.color);
		return { id };
	});

/** 测试连接（5s 超时）：成功返回 OS 信息，失败返回错误消息 */
export const testConnectionSFn = createServerFn({ method: "POST" })
	.validator(testConnectionSchema)
	.handler(async ({ data }) => testConnection(data));
