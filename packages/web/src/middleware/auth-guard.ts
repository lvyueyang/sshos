/**
 * 鉴权中间件 + 核心校验（对标 fsdx admin-auth 范式）：需要鉴权的 SFn / Server Route 按需挂载。
 * - SFn 挂 `authMiddleware`（function middleware，读 X-SSHOS-TOKEN → resolveAuthContext 校验 → next({ context })）；
 * - Server Route 挂 `authRouteGuard()`（组合 authMiddleware，捕获 AuthError 转 HTTP 状态码 JSON）；
 * - 公开 SFn（auth setup/login/status、bootstrap status）不挂，天然公开。
 * resolveAuthContext 为纯服务端校验：bootstrap 未 ready 抛 503；未配置启动密码 / token 缺失或无效抛 401。
 */

import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getBootstrapStatus } from "#/services/bootstrap/status";

/** 鉴权错误：携带 HTTP 状态码，供 Server Route 守卫转换为对应响应 */
export class AuthError extends Error {
	statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.statusCode = statusCode;
		this.name = "AuthError";
	}
}

/** 鉴权上下文：当前为本地单用户模式（启动密码登录），无用户维度 */
export interface AuthContext {
	authenticated: true;
}

/**
 * 校验 token 并返回鉴权上下文（不涉及 header 读取，由中间件层传入）：
 * - bootstrap 未 ready（迁移中）统一 503，前端载入界面兜底；
 * - 未配置启动密码 / token 缺失或验签失败抛 401。
 * #/services/auth/core（config/jwt）依赖 paths.server（.server.*），auth-guard 会被
 * client bundle 引用（SFn 挂载处），顶层静态 import 会把服务端模块拉进 renderer
 * 触发 import-protection，故此处动态 import 具体 core 文件。
 */
export async function resolveAuthContext(
	token: string | undefined,
): Promise<AuthContext> {
	if (getBootstrapStatus().phase !== "ready") {
		throw new AuthError("初始化未完成", 503);
	}
	const [{ isConfigured, readServerConfig }, { verifyJwt }] = await Promise.all(
		[import("#/services/auth/core/config"), import("#/services/auth/core/jwt")],
	);
	const cfg = readServerConfig();
	if (!isConfigured(cfg)) {
		throw new AuthError("未配置启动密码", 401);
	}
	if (!token || verifyJwt(token, cfg!.serverSecret) === null) {
		throw new AuthError("未登录或登录已过期", 401);
	}
	return { authenticated: true };
}

/**
 * SFn 鉴权中间件：读取 X-SSHOS-TOKEN → resolveAuthContext 校验 → next({ context })。
 * 校验失败抛 AuthError（sfErrorLogger 记 warn 后重抛），客户端 catch 后展示。
 */
export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const token = getRequestHeader("x-sshos-token");
	const ctx = await resolveAuthContext(token);
	return next({ context: ctx });
});

/**
 * Server Route 鉴权守卫：组合 authMiddleware，捕获 AuthError 转为 HTTP 状态码 JSON，
 * 避免中间件抛错被框架统一转 500（对标 fsdx adminPermRouteGuard）。
 * 当前无挂载点（业务接口均走 SFn；/api/health 天然豁免），供未来 Server Route 使用。
 */
export function authRouteGuard() {
	return createMiddleware()
		.middleware([authMiddleware])
		.server(async ({ next }) => {
			try {
				return await next();
			} catch (err) {
				if (err instanceof AuthError) {
					return new Response(JSON.stringify({ error: err.message }), {
						status: err.statusCode,
						headers: { "Content-Type": "application/json" },
					});
				}
				throw err;
			}
		});
}
