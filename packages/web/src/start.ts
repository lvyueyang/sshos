/**
 * TanStack Start 入口配置：全局中间件注册。
 * requestMiddleware 挂全局鉴权（决策记录 D19，纠正 D2 零 CSRF 判断）：
 * SFn 调用与 /api/* Server Route 统一校验 X-SSHOS-TOKEN，页面/静态资源/health 豁免。
 * serverFns.fetch 为 SFn 客户端请求统一注入鉴权头（token 来自 preload 注入的 window.sshOS.authToken）。
 */

import { createStart } from "@tanstack/react-start";
import { getAuthToken } from "#/lib/api-fetch";
import { authMiddleware } from "#/middleware/auth";
import { sfErrorLogger } from "#/middleware/sf-error-logger";

export const startInstance = createStart(() => ({
	requestMiddleware: [authMiddleware],
	functionMiddleware: [sfErrorLogger],
	serverFns: {
		// SFn 客户端请求统一带鉴权头（仅客户端生效；SSR 期 server 内部直接调用不走 HTTP）
		fetch: (input, init) => {
			const token = getAuthToken();
			if (!token) return fetch(input, init);
			const headers = new Headers(init?.headers);
			headers.set("X-SSHOS-TOKEN", token);
			return fetch(input, { ...init, headers });
		},
	},
}));
