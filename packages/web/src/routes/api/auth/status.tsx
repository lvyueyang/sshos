/**
 * 认证状态 Server Route：GET /api/auth/status
 * 返回 configured（是否已设置启动密码）与 authenticated（携带的 token 是否有效）。
 * 前端据此选择 SetupWizard / LoginForm / 桌面主界面。
 */

import { isConfigured, readServerConfig, verifyJwt } from "#/services/auth";
import { defineServerRoute } from "#/types/server-route";
import { json } from "./helpers";

export const Route = defineServerRoute("/api/auth/status", {
	server: {
		handlers: {
			GET: async (ctx) => {
				const cfg = readServerConfig();
				const configured = isConfigured(cfg);
				const token = ctx.request.headers.get("x-sshos-token");
				const authenticated =
					configured &&
					token !== null &&
					verifyJwt(token, cfg!.serverSecret) !== null;
				return json({ configured, authenticated });
			},
		},
	},
});
