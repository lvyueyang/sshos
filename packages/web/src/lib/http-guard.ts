/**
 * 全局鉴权豁免判定（供 requestMiddleware 使用）：
 * SFn 一律受保护，除公开注册的（lib/public-sfns）；/api/* 除 health 外受保护；
 * 页面 / 静态资源放行。
 */

import { isPublicSfn } from "#/lib/public-sfns";

/** 需要鉴权：SFn 除公开注册外一律校验；/api/* 除 health 外校验；页面与静态资源放行 */
export function isProtected(
	pathname: string,
	handlerType: "serverFn" | "router",
): boolean {
	if (handlerType === "serverFn") return !isPublicSfn(pathname);
	if (!pathname.startsWith("/api/")) return false;
	if (pathname.startsWith("/api/health")) return false;
	return true;
}
