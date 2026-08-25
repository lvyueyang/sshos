/**
 * TanStack Start 入口配置：全局中间件注册。
 * requestMiddleware 挂全局鉴权（决策记录 D21）：SFn 调用与 /api/* Server Route
 * 校验 X-SSHOS-TOKEN（JWT，与 server.json serverSecret 验签），页面/静态资源/
 * health/auth 豁免。
 * serverFns.fetch 为 SFn 客户端请求统一注入鉴权头（token 来自登录态 localStorage）。
 */

import { createStart } from "@tanstack/react-start";
import { getAuthToken } from "#/lib/auth-client";
import { authMiddleware } from "#/middleware/auth";
import { sfErrorLogger } from "#/middleware/sf-error-logger";

export const startInstance = createStart(() => ({
	requestMiddleware: [authMiddleware],
	functionMiddleware: [sfErrorLogger],
	serverFns: {
		// SFn 客户端请求统一带鉴权头（仅客户端生效；SSR 期 server 内部调用不走 HTTP）
		fetch: (input, init) => {
			const token = getAuthToken();
			if (!token) return fetch(input, init);
			const headers = new Headers(init?.headers);
			headers.set("X-SSHOS-TOKEN", token);
			return fetch(input, { ...init, headers });
		},
	},
}));
