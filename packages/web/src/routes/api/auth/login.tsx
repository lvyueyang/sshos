/**
 * 登录 Server Route：POST /api/auth/login
 * 校验启动密码，通过后签发 JWT（HS256，默认 30 天）返回给客户端。
 * 未配置时返回 409（应先进 setup 流程）。
 */

import {
	isConfigured,
	readServerConfig,
	signJwt,
	TOKEN_TTL_SEC,
	verifyPassword,
} from "#/services/auth";
import { defineServerRoute } from "#/types/server-route";
import { json, parseJsonBody, passwordSchema } from "./helpers";

export const Route = defineServerRoute("/api/auth/login", {
	server: {
		handlers: {
			POST: async (ctx) => {
				const cfg = readServerConfig();
				if (!isConfigured(cfg)) {
					return json({ error: "not configured" }, 409);
				}
				const input = await parseJsonBody(ctx.request, passwordSchema);
				if (!input || !verifyPassword(input.password, cfg!.passwordHash!)) {
					return json({ error: "invalid credentials" }, 401);
				}
				return json({
					token: signJwt("local", cfg!.serverSecret, TOKEN_TTL_SEC),
				});
			},
		},
	},
});
