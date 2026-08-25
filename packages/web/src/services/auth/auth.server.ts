/**
 * 认证服务逻辑：首次配置（setup）/ 登录（login）/ 状态查询（status）。
 * 读取或写入数据目录 server.json，签发 JWT；master.key 在 setup 时生成。
 */

import { randomBytes } from "node:crypto";
import {
	getOrCreateMasterKeyFile,
	hashPassword,
	isConfigured,
	readServerConfig,
	SERVER_DEFAULTS,
	signJwt,
	verifyJwt,
	verifyPassword,
	writeServerConfig,
} from "./index";

/** 首次配置：写 passwordHash + serverSecret（保留半配置的 port/bind），生成 master.key，返回 token */
export function setupServer(password: string): string {
	if (isConfigured()) throw new Error("already configured");
	const existing = readServerConfig();
	const serverSecret = randomBytes(32).toString("hex");
	getOrCreateMasterKeyFile();
	writeServerConfig({
		passwordHash: hashPassword(password),
		serverSecret,
		port: existing?.port ?? SERVER_DEFAULTS.port,
		bind: existing?.bind ?? SERVER_DEFAULTS.bind,
	});
	return signJwt("local", serverSecret);
}

/** 登录：校验启动密码，通过签发 JWT（默认 30 天） */
export function loginServer(password: string): string {
	const cfg = readServerConfig();
	if (!isConfigured(cfg)) throw new Error("not configured");
	if (!verifyPassword(password, cfg!.passwordHash!)) {
		throw new Error("invalid credentials");
	}
	return signJwt("local", cfg!.serverSecret);
}

/** 认证状态：configured（已设密码）+ authenticated（携带 token 是否有效） */
export function getAuthStatus(token?: string | null): {
	configured: boolean;
	authenticated: boolean;
} {
	const cfg = readServerConfig();
	const configured = isConfigured(cfg);
	const authenticated =
		configured &&
		Boolean(token) &&
		verifyJwt(token!, cfg!.serverSecret) !== null;
	return { configured, authenticated };
}
