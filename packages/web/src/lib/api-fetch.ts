/**
 * 统一 API 请求工具（决策记录 D19）：
 * 渲染层手动 fetch Server Route（pty/metrics/ai.chat/sftp/deeplink）时统一注入
 * X-SSHOS-TOKEN 鉴权头，与全局 request 中间件校验对应；
 * token 由 Electron main 经 preload 注入 window.sshOS.authToken。
 */

/** 读取渲染层持有的鉴权 token（preload 注入；纯浏览器 dev 无 Electron 时为 undefined） */
export function getAuthToken(): string | undefined {
	return window.sshOS?.authToken;
}

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
