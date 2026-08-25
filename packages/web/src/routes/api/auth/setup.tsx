/**
 * 首次配置 Server Route：POST /api/auth/setup
 * 未配置（server.json 无 passwordHash）时设置启动密码，
 * 生成 JWT 签名密钥与凭据加密主密钥并写入数据目录，返回登录 token 自动登录。
 * 已配置后拒绝再次 setup（改密码后续版本提供）。
 */

import { randomBytes } from "node:crypto";
import {
	getOrCreateMasterKeyFile,
	hashPassword,
	isConfigured,
	readServerConfig,
	SERVER_DEFAULTS,
	signJwt,
	writeServerConfig,
} from "#/services/auth";
import { defineServerRoute } from "#/types/server-route";
import { json, parseJsonBody, passwordSchema } from "./helpers";

export const Route = defineServerRoute("/api/auth/setup", {
	server: {
		handlers: {
			POST: async (ctx) => {
				if (isConfigured()) {
					return json({ error: "already configured" }, 409);
				}
				const input = await parseJsonBody(ctx.request, passwordSchema);
				if (!input) {
					return json({ error: "password required" }, 400);
				}
				// 半配置场景（手动预写 port/bind 但未设密码）：保留 port/bind，其余落默认值
				const existing = readServerConfig();
				const serverSecret = randomBytes(32).toString("hex");
				getOrCreateMasterKeyFile();
				writeServerConfig({
					passwordHash: hashPassword(input.password),
					serverSecret,
					port: existing?.port ?? SERVER_DEFAULTS.port,
					bind: existing?.bind ?? SERVER_DEFAULTS.bind,
				});
				return json({ token: signJwt("local", serverSecret) });
			},
		},
	},
});
