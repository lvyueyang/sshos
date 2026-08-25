/**
 * 认证 Server Route 公共工具：JSON 响应与入参解析。
 */

import { z } from "zod";

/** 启动密码入参（setup / login 共用；仅要求非空字符串） */
export const passwordSchema = z.object({
	password: z.string().min(1).max(256),
});

/** 返回 JSON 响应 */
export function json(data: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** 解析 JSON body 并做 zod 校验；失败返回 null（调用方返回 400） */
export async function parseJsonBody<T>(
	request: Request,
	schema: z.ZodSchema<T>,
): Promise<T | null> {
	try {
		const body = (await request.json()) as unknown;
		const result = schema.safeParse(body);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
