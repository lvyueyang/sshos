/**
 * 全局请求鉴权中间件（决策记录 D21）：
 * 对所有 SFn 调用与 /api/* Server Route 校验 X-SSHOS-TOKEN 携带的 JWT
 * （HS256，与 server.json 的 serverSecret 验签），页面 / 静态资源 / health /
 * /api/auth/*（setup/login/status）/ /api/bootstrap/*（初始化状态）豁免。
 * 未完成首次配置时业务请求一律 401；初始化（bootstrap）未完成时业务请求一律 503。
 */

import { createMiddleware } from "@tanstack/react-start";
import { isConfigured, readServerConfig, verifyJwt } from "#/services/auth";
import { getBootstrapStatus } from "#/services/bootstrap/status";

/** 需要鉴权：SFn 一律校验；/api/* 除 health、auth、bootstrap 外校验；页面与静态资源放行 */
export function isProtected(
	pathname: string,
	handlerType: "serverFn" | "router",
): boolean {
	if (handlerType === "serverFn") return true;
	if (!pathname.startsWith("/api/")) return false;
	if (pathname.startsWith("/api/health")) return false;
	if (pathname.startsWith("/api/auth/")) return false;
	if (pathname.startsWith("/api/bootstrap/")) return false;
	return true;
}

export const authMiddleware = createMiddleware({ type: "request" }).server(
	async ({ request, next, handlerType }) => {
		const url = new URL(request.url);
		if (!isProtected(url.pathname, handlerType)) return next();
		// 初始化未完成：业务依赖数据库尚未就绪，统一 503（前端载入界面兜底，不落 500）
		if (getBootstrapStatus().phase !== "ready") {
			return new Response(JSON.stringify({ error: "initializing" }), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			});
		}
		const cfg = readServerConfig();
		if (!isConfigured(cfg)) {
			return new Response("unauthorized", { status: 401 });
		}
		const token = request.headers.get("x-sshos-token");
		if (!token || verifyJwt(token, cfg!.serverSecret) === null) {
			return new Response("unauthorized", { status: 401 });
		}
		return next();
	},
);
