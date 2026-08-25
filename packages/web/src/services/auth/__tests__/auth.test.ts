/**
 * 认证服务单元测试：server.json 配置读写、scrypt 密码哈希、JWT 签发与校验。
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	isConfigured,
	readServerConfig,
	SERVER_DEFAULTS,
	writeServerConfig,
} from "../config";
import { signJwt, TOKEN_TTL_SEC, verifyJwt } from "../jwt";
import { hashPassword, verifyPassword } from "../password";

const dataDir = mkdtempSync(join(tmpdir(), "sshos-auth-"));
process.env.SSHOS_DATA_DIR = dataDir;

afterAll(() => {
	delete process.env.SSHOS_DATA_DIR;
});

describe("server.json 配置读写", () => {
	it("初始无配置，isConfigured 为 false", () => {
		expect(readServerConfig()).toBeNull();
		expect(isConfigured()).toBe(false);
	});

	it("写入后读取往返，默认 port/bind 回落", () => {
		writeServerConfig({
			passwordHash: "salt:hash",
			serverSecret: "secret-hex",
			port: 3456,
			bind: "0.0.0.0",
		});
		const cfg = readServerConfig();
		expect(cfg).toMatchObject({
			passwordHash: "salt:hash",
			serverSecret: "secret-hex",
			port: 3456,
			bind: "0.0.0.0",
		});
		expect(isConfigured()).toBe(true);

		// 半配置（只写 port/bind）：不视为已配置
		writeServerConfig({
			...cfg!,
			passwordHash: null,
		});
		expect(isConfigured()).toBe(false);
		// 缺失字段回落到默认值
		const raw = readServerConfig();
		writeServerConfig({
			passwordHash: raw?.passwordHash ?? null,
			serverSecret: raw?.serverSecret ?? "",
			port: Number.NaN,
			bind: "127.0.0.1",
		});
		expect(readServerConfig()?.port).toBe(SERVER_DEFAULTS.port);
	});
});

describe("scrypt 密码哈希", () => {
	it("哈希不含明文，校验正确", () => {
		const hash = hashPassword("my-pass");
		expect(hash).not.toContain("my-pass");
		expect(verifyPassword("my-pass", hash)).toBe(true);
		expect(verifyPassword("wrong-pass", hash)).toBe(false);
	});

	it("同一密码哈希不同（随机 salt）", () => {
		expect(hashPassword("same")).not.toBe(hashPassword("same"));
	});

	it("非法存储格式返回 false", () => {
		expect(verifyPassword("x", "not-a-hash")).toBe(false);
	});
});

describe("JWT 签发与校验", () => {
	it("签发的 token 可校验，载荷正确", () => {
		const token = signJwt("local", "secret");
		const payload = verifyJwt(token, "secret");
		expect(payload?.sub).toBe("local");
		expect(payload!.exp - payload!.iat).toBe(TOKEN_TTL_SEC);
	});

	it("错误密钥 / 篡改载荷校验失败", () => {
		const token = signJwt("local", "secret-a");
		expect(verifyJwt(token, "secret-b")).toBeNull();
		// 篡改 payload 中间段
		const [header, , signature] = token.split(".");
		const tampered = `${header}.${Buffer.from(
			JSON.stringify({ sub: "evil", iat: 0, exp: 4102444800 }),
		).toString("base64url")}.${signature}`;
		expect(verifyJwt(tampered, "secret-a")).toBeNull();
	});

	it("过期 token 校验失败", () => {
		const token = signJwt("local", "secret", -1);
		expect(verifyJwt(token, "secret")).toBeNull();
	});

	it("非法 token 返回 null", () => {
		expect(verifyJwt("not-a-jwt", "secret")).toBeNull();
		expect(verifyJwt("", "secret")).toBeNull();
	});
});
