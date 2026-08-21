/**
 * 全局请求鉴权中间件（决策记录 D19）：
 * 对所有 SFn 调用与 /api/* Server Route（health 自检豁免）校验 X-SSHOS-TOKEN，
 * 与 Electron main 注入的 SSHOS_AUTH_TOKEN 比对；页面 / 静态资源不含业务数据，放行。
 * 仅当 SSHOS_AUTH_TOKEN 注入时启用（生产与 Electron dev 的 main 必注入；纯浏览器 dev:web 无注入不校验）。
 */

import { createMiddleware } from "@tanstack/react-start";

/** 需要鉴权：SFn 调用一律校验；/api/* 路由除 health 自检外校验；页面与静态资源放行 */
export function isProtected(
	pathname: string,
	handlerType: "serverFn" | "router",
): boolean {
	if (handlerType === "serverFn") return true;
	if (!pathname.startsWith("/api/")) return false;
	return !pathname.startsWith("/api/health");
}

export const authMiddleware = createMiddleware({ type: "request" }).server(
	async ({ request, next, handlerType }) => {
		// 未注入 token 的环境（纯浏览器 dev:web）不启用校验
		const expected = process.env.SSHOS_AUTH_TOKEN;
		if (!expected) return next();
		const url = new URL(request.url);
		if (!isProtected(url.pathname, handlerType)) return next();
		const token = request.headers.get("x-sshos-token");
		if (token !== expected) {
			return new Response("unauthorized", { status: 401 });
		}
		return next();
	},
);
