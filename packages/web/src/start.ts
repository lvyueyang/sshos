/**
 * TanStack Start 入口配置：SFn 客户端请求统一注入鉴权头 + 全局错误日志。
 * 鉴权不在全局 request 层做（fsdx 范式）：各业务 SFn 自行挂 authMiddleware，
 * 公开 SFn（auth setup/login/status、bootstrap status）不挂即公开。
 * serverFns.fetch 为 SFn 客户端请求统一注入鉴权头（token 来自登录态 localStorage）。
 */

import { createStart } from "@tanstack/react-start";
import { getAuthToken } from "#/lib/auth-client/auth-client";
import { sfErrorLogger } from "#/middleware/sf-error-logger";

export const startInstance = createStart(() => ({
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
