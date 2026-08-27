/**
 * 客户端认证状态：登录 token 的存取（localStorage）。
 * 桌面壳与纯浏览器同构（Electron localStorage 持久），无需宿主注入。
 */

const TOKEN_KEY = "sshos.auth-token";

/** 读取已登录 token；SSR / 无 localStorage 环境返回 undefined */
export function getAuthToken(): string | undefined {
	if (typeof localStorage === "undefined") return undefined;
	return localStorage.getItem(TOKEN_KEY) ?? undefined;
}

/** 登录 / setup 成功后写入 token */
export function setAuthToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

/** 登出：客户端丢弃 token（服务端无状态，无需接口） */
export function clearAuthToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}
