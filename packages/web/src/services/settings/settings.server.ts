/**
 * 设置与连接配置服务层：连接 / 分组 / 设置 / 每连接配置的数据库读写。
 * 敏感凭据经 crypto 加密入库；连接时由 ssh.server 解密组装 ConnectionOptions。
 */

import type { AuthType } from "@sshos/core";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/db";
import { decrypt, encrypt } from "#/db/crypto";
import {
	connection,
	connectionGroup,
	connectionHistory,
	connectionSetting,
	setting,
} from "#/db/schema";
import { getDataDir } from "#/lib/paths";

/** 连接写操作入参（敏感字段为明文，入库前加密） */
export interface ConnectionInput {
	title: string;
	host: string;
	port?: number;
	username: string;
	authType: AuthType;
	password?: string;
	privateKey?: string;
	privateKeyPath?: string;
	passphrase?: string;
	groupId?: number | null;
	term?: string;
	color?: string;
	isProduction?: boolean;
	aiEnabled?: boolean;
}

/** 数据库连接行（供服务层消费） */
export type ConnectionRow = typeof connection.$inferSelect;

/** 新建连接，返回连接 ID */
export async function createConnection(
	input: ConnectionInput,
): Promise<number> {
	const [row] = await db
		.insert(connection)
		.values({
			title: input.title,
			host: input.host,
			port: input.port ?? 22,
			username: input.username,
			authType: input.authType,
			passwordEnc: input.password ? encrypt(input.password) : undefined,
			privateKeyEnc: input.privateKey ? encrypt(input.privateKey) : undefined,
			privateKeyPath: input.privateKeyPath,
			passphraseEnc: input.passphrase ? encrypt(input.passphrase) : undefined,
			groupId: input.groupId ?? undefined,
			term: input.term ?? "xterm-256color",
			color: input.color,
			isProduction: input.isProduction ? 1 : 0,
			aiEnabled: input.aiEnabled === false ? 0 : 1,
		})
		.returning({ id: connection.id });
	return row.id;
}

/** 更新连接；未提供的敏感字段保持原值 */
export async function updateConnection(
	id: number,
	input: Partial<ConnectionInput>,
): Promise<void> {
	await db
		.update(connection)
		.set({
			title: input.title,
			host: input.host,
			port: input.port,
			username: input.username,
			authType: input.authType,
			passwordEnc: input.password ? encrypt(input.password) : undefined,
			privateKeyEnc: input.privateKey ? encrypt(input.privateKey) : undefined,
			privateKeyPath: input.privateKeyPath,
			passphraseEnc: input.passphrase ? encrypt(input.passphrase) : undefined,
			groupId: input.groupId === undefined ? undefined : input.groupId,
			term: input.term,
			color: input.color,
			isProduction:
				input.isProduction === undefined
					? undefined
					: input.isProduction
						? 1
						: 0,
			aiEnabled:
				input.aiEnabled === undefined ? undefined : input.aiEnabled ? 1 : 0,
		})
		.where(eq(connection.id, id));
}

/** 删除连接（先清子表避免外键约束） */
export async function deleteConnection(id: number): Promise<void> {
	await db
		.delete(connectionSetting)
		.where(eq(connectionSetting.connectionId, id));
	await db.delete(connection).where(eq(connection.id, id));
}

/** 查询单个连接 */
export async function getConnection(
	id: number,
): Promise<ConnectionRow | undefined> {
	const [row] = await db.select().from(connection).where(eq(connection.id, id));
	return row;
}

/** 列出全部连接（按分组与排序） */
export async function listConnections(): Promise<ConnectionRow[]> {
	return db
		.select()
		.from(connection)
		.orderBy(connection.sortOrder, connection.id);
}

/** 新建分组，返回分组 ID */
export async function createGroup(
	name: string,
	color?: string,
): Promise<number> {
	const [row] = await db
		.insert(connectionGroup)
		.values({ name, color })
		.returning({ id: connectionGroup.id });
	return row.id;
}

/** 列出全部分组 */
export async function listGroups() {
	return db.select().from(connectionGroup).orderBy(connectionGroup.sortOrder);
}

/** 读取全局设置（value 为 JSON 序列化） */
export async function getSetting<T>(key: string): Promise<T | undefined> {
	const [row] = await db.select().from(setting).where(eq(setting.key, key));
	return row ? (JSON.parse(row.value) as T) : undefined;
}

/** 写入全局设置（upsert） */
export async function setSetting<T>(key: string, value: T): Promise<void> {
	const json = JSON.stringify(value);
	await db
		.insert(setting)
		.values({ key, value: json })
		.onConflictDoUpdate({ target: setting.key, set: { value: json } });
}

/** 删除全局设置（upsert 清理用，避免残留 null 占位行） */
export async function deleteSetting(key: string): Promise<void> {
	await db.delete(setting).where(eq(setting.key, key));
}

/** 读取每连接配置（如 app.<id>.state / desktop.layout） */
export async function getConnectionSetting<T>(
	connectionId: number,
	key: string,
): Promise<T | undefined> {
	const [row] = await db
		.select()
		.from(connectionSetting)
		.where(
			and(
				eq(connectionSetting.connectionId, connectionId),
				eq(connectionSetting.key, key),
			),
		);
	return row ? (JSON.parse(row.value) as T) : undefined;
}

/** 写入每连接配置（upsert） */
export async function setConnectionSetting<T>(
	connectionId: number,
	key: string,
	value: T,
): Promise<void> {
	const json = JSON.stringify(value);
	await db
		.insert(connectionSetting)
		.values({ connectionId, key, value: json, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [connectionSetting.connectionId, connectionSetting.key],
			set: { value: json, updatedAt: new Date() },
		});
}

/** 列出连接最近历史（去重前的原始记录，按时间倒序） */
export async function listConnectionHistory(limit = 50) {
	return db
		.select()
		.from(connectionHistory)
		.orderBy(desc(connectionHistory.connectedAt))
		.limit(limit);
}

/** 写入一条连接历史 */
export async function recordConnectionHistory(input: {
	connectionId?: number;
	host: string;
	port: number;
	username: string;
	duration?: number;
}): Promise<void> {
	await db.insert(connectionHistory).values({
		connectionId: input.connectionId,
		host: input.host,
		port: input.port,
		username: input.username,
		connectedAt: new Date(),
		duration: input.duration,
	});
}

/** 解密连接凭据（供 ssh.server 组装 ConnectionOptions） */
export function decryptCredential(enc?: string | null): string | undefined {
	return enc ? decrypt(enc) : undefined;
}

/** 系统信息（通用设置页展示；数据目录为服务端唯一事实来源） */
export function getSystemInfo(): { dataDir: string } {
	return { dataDir: getDataDir() };
}
