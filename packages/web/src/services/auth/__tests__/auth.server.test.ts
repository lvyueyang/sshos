/**
 * 认证服务逻辑单元测试（auth.server）：
 * 首次配置 / 登录 / 状态查询，覆盖 server.json 写入与 JWT 签发链路。
 */

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getAuthStatus, loginServer, setupServer } from "../auth.server";
import { getServerConfigPath, isConfigured } from "../core/config";

const dataDir = mkdtempSync(join(tmpdir(), "sshos-auth-server-"));
process.env.SSHOS_DATA_DIR = dataDir;

afterAll(() => {
	delete process.env.SSHOS_DATA_DIR;
});

describe("认证服务逻辑", () => {
	it("setup：写入 server.json，返回 JWT，二次 setup 抛错", () => {
		const token = setupServer("setup-pass");
		expect(token.split(".")).toHaveLength(3);
		expect(existsSync(getServerConfigPath())).toBe(true);
		expect(isConfigured()).toBe(true);
		expect(() => setupServer("another")).toThrow("already configured");
	});

	it("login：正确密码签发 JWT，错误密码 / 未配置抛错", () => {
		expect(loginServer("setup-pass").split(".")).toHaveLength(3);
		expect(() => loginServer("wrong-pass")).toThrow("invalid credentials");
	});

	it("getAuthStatus：configured 与 authenticated 判定", () => {
		expect(getAuthStatus()).toEqual({ configured: true, authenticated: false });
		const token = loginServer("setup-pass");
		expect(getAuthStatus(token)).toEqual({
			configured: true,
			authenticated: true,
		});
		expect(getAuthStatus("bad.token")).toEqual({
			configured: true,
			authenticated: false,
		});
	});
});
