/**
 * 统一 API 请求工具（决策记录 D21）：
 * 渲染层手动 fetch Server Route（pty/metrics/ai.chat/sftp）时统一注入
 * X-SSHOS-TOKEN 鉴权头；token 由登录 / setup 写入 localStorage（lib/auth-client）。
 */

import { getAuthToken } from "./auth-client";

/** 给 fetch 注入鉴权头（存在 token 时） */
export function apiFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const token = getAuthToken();
	if (!token) return fetch(input, init);
	const headers = new Headers(init?.headers);
	headers.set("X-SSHOS-TOKEN", token);
	return fetch(input, { ...init, headers });
}

/** 供 XHR（文件上传进度）使用的鉴权头 */
export function authHeaders(): Record<string, string> {
	const token = getAuthToken();
	return token ? { "X-SSHOS-TOKEN": token } : {};
}
