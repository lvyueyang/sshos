/**
 * 设置 / 连接配置服务层单元测试：
 * 临时数据目录 + 程序化迁移，验证连接 CRUD、凭据加密落盘、设置读写
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import {
	decrypt,
	encrypt,
	resetCredentialEncryptor,
	setCredentialEncryptor,
} from "../../../db/crypto";
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

describe("crypto 凭据加解密", () => {
	it("加密结果不含明文，可还原", () => {
		const enc = encrypt("my-secret");
		expect(enc).not.toContain("my-secret");
		expect(decrypt(enc)).toBe("my-secret");
	});

	it("不同明文加密结果不同（随机 iv）", () => {
		expect(encrypt("a")).not.toBe(encrypt("a"));
	});
});

describe("连接 CRUD", () => {
	it("创建连接：凭据加密落盘，明文不出现", async () => {
		const id = await settings.createConnection(connectionInput);
		expect(id).toBeGreaterThan(0);

		// 直接查 db 文件确认 passwordEnc 为密文
		const sqlite = new DatabaseSync(getDbPath(), { readOnly: true });
		const row = sqlite
			.prepare("SELECT password_enc FROM connection WHERE id = ?")
			.get(id) as { password_enc: string };
		sqlite.close();
		expect(row.password_enc).not.toContain("s3cret-password");
		expect(decrypt(row.password_enc)).toBe("s3cret-password");
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
		expect(decrypt(conn?.passwordEnc ?? "")).toBe("new-pass");
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
});

describe("crypto master key（D21 文件密钥）", () => {
	it("master.key 文件密钥加解密可用，密文不含明文", () => {
		const enc = encrypt("file-key-secret");
		expect(enc).not.toContain("file-key-secret");
		expect(decrypt(enc)).toBe("file-key-secret");
	});

	it("setCredentialEncryptor 宿主注入覆盖文件密钥，互不通用", () => {
		setCredentialEncryptor(
			(plain) => `host:${Buffer.from(plain, "utf-8").toString("base64")}`,
			(enc) =>
				Buffer.from(enc.replace(/^host:/, ""), "base64").toString("utf-8"),
		);
		try {
			const enc = encrypt("host-secret");
			expect(decrypt(enc)).toBe("host-secret");
			// 换回文件密钥后 host 加密器产物无法解密（GCM/格式不匹配抛错）
			resetCredentialEncryptor();
			expect(() => decrypt(enc)).toThrow();
		} finally {
			resetCredentialEncryptor();
		}
	});
});
