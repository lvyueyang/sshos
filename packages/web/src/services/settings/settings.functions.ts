/**
 * 连接 / 分组管理 SFn（docs 技术架构 §5.4）：
 * 列表 / 查询 / 新建 / 更新 / 删除 / 测试连接。凭据加密在 settings.server 处理。
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { batchWriter } from "#/lib/batch-writer";
import { testConnection } from "#/services/ssh/ssh.server";
import {
	connectionInputSchema,
	createGroupSchema,
	deleteConnectionSchema,
	deleteGroupSchema,
	getConnectionSettingSchema,
	getGlobalSettingSchema,
	getSystemInfoSchema,
	type JsonValue,
	recordAuditSchema,
	reorderConnectionsSchema,
	reorderGroupsSchema,
	setConnectionSettingSchema,
	setGlobalSettingSchema,
	testConnectionSchema,
	updateConnectionSchema,
	updateGroupSchema,
} from "./settings.schemas";
import {
	createConnection,
	createGroup,
	deleteConnection,
	deleteGroup,
	getConnection,
	getConnectionSetting,
	getSetting,
	getSystemInfo,
	listConnections,
	listGroups,
	reorderConnections,
	reorderGroups,
	setConnectionSetting,
	setSetting,
	updateConnection,
	updateGroup,
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

/** 更新分组 */
export const updateGroupSFn = createServerFn({ method: "POST" })
	.validator(updateGroupSchema)
	.handler(async ({ data }) => {
		await updateGroup(data.id, { name: data.name, color: data.color });
		return { ok: true };
	});

/** 删除分组，连接转入默认分组 */
export const deleteGroupSFn = createServerFn({ method: "POST" })
	.validator(deleteGroupSchema)
	.handler(async ({ data }) => {
		await deleteGroup(data.id);
		return { ok: true };
	});

/** 保存分组拖拽顺序 */
export const reorderGroupsSFn = createServerFn({ method: "POST" })
	.validator(reorderGroupsSchema)
	.handler(async ({ data }) => {
		await reorderGroups(data.ids);
		return { ok: true };
	});

/** 保存连接拖拽顺序与目标分组 */
export const reorderConnectionsSFn = createServerFn({ method: "POST" })
	.validator(reorderConnectionsSchema)
	.handler(async ({ data }) => {
		await reorderConnections(data.groupId, data.connectionIds);
		return { ok: true };
	});

/** 测试连接（5s 超时）：成功返回 OS 信息，失败返回错误消息 */
export const testConnectionSFn = createServerFn({ method: "POST" })
	.validator(testConnectionSchema)
	.handler(async ({ data }) => testConnection(data));

/** 读取每连接配置（App 框架 settings 网关，key = app.<id>.state / desktop.layout） */
export const getConnectionSettingSFn = createServerFn({ method: "GET" })
	.validator(getConnectionSettingSchema)
	.handler(async ({ data }): Promise<JsonValue | undefined> => {
		const value = await getConnectionSetting<unknown>(
			data.connectionId,
			data.key,
		);
		return value as JsonValue | undefined;
	});

/** 写入每连接配置（upsert） */
export const setConnectionSettingSFn = createServerFn({ method: "POST" })
	.validator(setConnectionSettingSchema)
	.handler(async ({ data }) => {
		await setConnectionSetting(data.connectionId, data.key, data.value);
		return { ok: true };
	});

/** 读取全局设置（setting 表，键值 JSON 序列化；如 appearance.theme） */
export const getGlobalSettingSFn = createServerFn({ method: "GET" })
	.validator(getGlobalSettingSchema)
	.handler(async ({ data }): Promise<JsonValue | undefined> => {
		const value = await getSetting<unknown>(data.key);
		return value as JsonValue | undefined;
	});

/** 写入全局设置（upsert；值 JSON 序列化） */
export const setGlobalSettingSFn = createServerFn({ method: "POST" })
	.validator(setGlobalSettingSchema)
	.handler(async ({ data }) => {
		await setSetting(data.key, data.value);
		return { ok: true };
	});

/** 系统信息（通用设置页：数据目录 / 运行环境） */
export const getSystemInfoSFn = createServerFn({ method: "GET" })
	.validator(getSystemInfoSchema)
	.handler(async () => getSystemInfo());

/** App 框架审计记录（ctx.audit.record 的服务端落库通道） */
export const recordAuditSFn = createServerFn({ method: "POST" })
	.validator(recordAuditSchema)
	.handler(async ({ data }) => {
		batchWriter.enqueue({
			type: "ai_audit",
			sessionId: data.sessionId,
			command: data.command,
			classification: data.classification,
			action: data.action ?? "executed",
			result: data.result ?? "success",
		});
		return { ok: true };
	});
