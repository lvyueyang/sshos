/**
 * 设置 / 连接配置服务层单元测试：
 * 临时数据目录 + 程序化迁移，验证连接 CRUD、凭据明文落盘、设置读写
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { getDbPath, runMigrations } from "../../../db/migrate";
import * as settings from "../settings.server";

const dataDir = mkdtempSync(join(tmpdir(), "sshos-settings-"));
process.env.SSHOS_DATA_DIR = dataDir;

const connectionInput: settings.ConnectionInput = {
	title: "web-01",
	host: "10.0.0.1",
	port: 22,
	username: "root",
	authType: "password",
	password: "s3cret-password",
	isProduction: true,
};

beforeAll(async () => {
	await runMigrations();
});

describe("连接 CRUD", () => {
	it("创建连接：凭据明文落盘", async () => {
		const id = await settings.createConnection(connectionInput);
		expect(id).toBeGreaterThan(0);

		// 直接查 db 文件确认 password 为明文
		const sqlite = new DatabaseSync(getDbPath(), { readOnly: true });
		const row = sqlite
			.prepare("SELECT password FROM connection WHERE id = ?")
			.get(id) as { password: string };
		sqlite.close();
		expect(row.password).toBe("s3cret-password");
	});

	it("查询与列表", async () => {
		const id = await settings.createConnection({
			...connectionInput,
			title: "web-02",
			host: "10.0.0.2",
		});
		const conn = await settings.getConnection(id);
		expect(conn?.host).toBe("10.0.0.2");
		expect(conn?.isProduction).toBe(1);

		const all = await settings.listConnections();
		expect(all.length).toBeGreaterThanOrEqual(2);
	});

	it("更新连接：修改标题与认证字段", async () => {
		const id = await settings.createConnection(connectionInput);
		await settings.updateConnection(id, {
			title: "web-01-updated",
			password: "new-pass",
		});
		const conn = await settings.getConnection(id);
		expect(conn?.title).toBe("web-01-updated");
		expect(conn?.password).toBe("new-pass");
	});

	it("删除连接并级联清理 connection_setting", async () => {
		const id = await settings.createConnection(connectionInput);
		await settings.setConnectionSetting(id, "desktop.layout", { windows: [] });
		await settings.deleteConnection(id);
		expect(await settings.getConnection(id)).toBeUndefined();
		expect(
			await settings.getConnectionSetting(id, "desktop.layout"),
		).toBeUndefined();
	});
});

describe("设置读写", () => {
	it("全局设置 upsert", async () => {
		await settings.setSetting("appearance.theme", "light");
		expect(await settings.getSetting("appearance.theme")).toBe("light");
		await settings.setSetting("appearance.theme", "dark");
		expect(await settings.getSetting("appearance.theme")).toBe("dark");
	});

	it("每连接设置 upsert（唯一键）", async () => {
		const id = await settings.createConnection(connectionInput);
		await settings.setConnectionSetting(id, "app.clock.state", {
			format: "24h",
		});
		expect(await settings.getConnectionSetting(id, "app.clock.state")).toEqual({
			format: "24h",
		});
	});
});

describe("分组管理", () => {
	it("创建并列出分组", async () => {
		const id = await settings.createGroup("开发", "#0969DA");
		const groups = await settings.listGroups();
		expect(groups.some((g) => g.id === id && g.name === "开发")).toBe(true);
	});

	it("分组名称 trim 且拒绝空白、默认和重复名称", async () => {
		const id = await settings.createGroup("  测试分组  ");
		expect(
			(await settings.listGroups()).find((group) => group.id === id)?.name,
		).toBe("测试分组");
		await expect(settings.createGroup(" 测试分组 ")).rejects.toThrow("已存在");
		await expect(settings.createGroup("   ")).rejects.toThrow("不能为空");
		await expect(settings.createGroup("默认")).rejects.toThrow("不能使用默认");
	});

	it("删除分组后连接转入默认分组", async () => {
		const groupId = await settings.createGroup("待删除");
		const connectionId = await settings.createConnection({
			...connectionInput,
			title: "group-delete",
			groupId,
		});
		await settings.deleteGroup(groupId);
		expect((await settings.getConnection(connectionId))?.groupId).toBeNull();
	});

	it("连接排序可以移动到自定义分组或默认分组", async () => {
		const groupId = await settings.createGroup("排序目标");
		const connectionId = await settings.createConnection({
			...connectionInput,
			title: "reorder-connection",
		});
		await settings.reorderConnections(groupId, [connectionId]);
		expect((await settings.getConnection(connectionId))?.groupId).toBe(groupId);
		await settings.reorderConnections(null, [connectionId]);
		expect((await settings.getConnection(connectionId))?.groupId).toBeNull();
	});

	it("跨组移动后源分组排序连续", async () => {
		const sourceGroupId = await settings.createGroup("排序源");
		const targetGroupId = await settings.createGroup("排序目的");
		const firstId = await settings.createConnection({
			...connectionInput,
			title: "source-first",
			groupId: sourceGroupId,
		});
		const movedId = await settings.createConnection({
			...connectionInput,
			title: "source-moved",
			groupId: sourceGroupId,
		});
		await settings.reorderConnections(targetGroupId, [movedId]);
		const sourceRows = (await settings.listConnections()).filter(
			(connection) => connection.groupId === sourceGroupId,
		);
		expect(
			sourceRows.find((connection) => connection.id === firstId)?.sortOrder,
		).toBe(0);
	});
});
