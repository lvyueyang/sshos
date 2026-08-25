/**
 * 全局请求鉴权中间件（决策记录 D21）：
 * 对所有受保护请求校验 X-SSHOS-TOKEN 携带的 JWT（HS256，与 server.json 的
 * serverSecret 验签）。豁免：页面 / 静态资源、/api/health、公开 SFn
 * （lib/public-sfns 注册表，如 auth setup/login/status、bootstrap status）。
 * 未完成首次配置时业务请求一律 401；初始化（bootstrap）未完成时业务请求一律 503。
 */

import { createMiddleware } from "@tanstack/react-start";
import { isProtected } from "#/lib/http-guard";
import { isConfigured, readServerConfig, verifyJwt } from "#/services/auth";
import { getBootstrapStatus } from "#/services/bootstrap/status";

export { isProtected } from "#/lib/http-guard";

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
