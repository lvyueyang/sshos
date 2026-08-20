/**
 * Server Route 内 JSON 解析 / 响应辅助（W0 spike 用，避免重复样板）
 */

/** 解析请求体 JSON */
export async function json<T>(request: Request): Promise<T> {
	return (await request.json()) as T;
}

/** 构造 JSON 响应 */
export function jsonResponse<T>(data: T, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
