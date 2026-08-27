/**
 * 通用 API 请求封装（基于 fetch）：调用 SFn 之外的 HTTP 端点（Server Route / 外部接口）。
 * 自动注入 X-SSHOS-TOKEN（D21 鉴权）、JSON 序列化入参 / 解析出参、非 2xx 抛错、
 * query 参数与超时。业务 RPC 优先走 SFn（统一鉴权 + 类型安全），本封装用于原生端点场景。
 */

import { getAuthToken } from "../auth-client/auth-client";

/** 请求配置：在 RequestInit 之上补充 JSON body / query / 超时 */
export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
	/** 自动 JSON.stringify 的请求体；FormData 原样透传（不设 Content-Type） */
	body?: unknown;
	/** 追加到 URL 的 query 参数（undefined 值跳过） */
	query?: Record<string, string | number | boolean | undefined>;
	/** 超时毫秒，默认 30_000；0 = 不超时 */
	timeoutMs?: number;
}

/** 拼 query 到相对路径（纯字符串处理，不依赖 window.location） */
function buildUrl(input: string, query?: ApiRequestOptions["query"]): string {
	if (!query) return input;
	const [base, hash = ""] = input.split("#", 2);
	const [path, existing = ""] = base.split("?", 2);
	const params = new URLSearchParams(existing);
	for (const [k, v] of Object.entries(query)) {
		if (v !== undefined) params.set(k, String(v));
	}
	const qs = params.toString();
	return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * 通用 API 请求：注入鉴权头 → fetch → 非 2xx 抛错（携带响应文本）→ JSON 解析。
 * body 为普通对象时自动 JSON 序列化；FormData 原样透传（用于文件上传）。
 */
export async function request<T>(
	input: string,
	opts: ApiRequestOptions = {},
): Promise<T> {
	const { body, query, timeoutMs = 30_000, headers, ...init } = opts;

	const finalHeaders = new Headers(headers);
	const token = getAuthToken();
	if (token) finalHeaders.set("X-SSHOS-TOKEN", token);
	const isForm = body instanceof FormData;
	if (body !== undefined && !isForm) {
		finalHeaders.set("Content-Type", "application/json");
	}

	const controller = new AbortController();
	const timer =
		timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
	try {
		const res = await fetch(buildUrl(input, query), {
			...init,
			headers: finalHeaders,
			body:
				body === undefined ? undefined : isForm ? body : JSON.stringify(body),
			signal: controller.signal,
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`请求失败 (${res.status}): ${text || res.statusText}`);
		}
		if (res.status === 204) return undefined as T;
		return (await res.json()) as T;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** GET 请求（query 参数自动拼 URL） */
export function apiGet<T>(
	input: string,
	query?: ApiRequestOptions["query"],
): Promise<T> {
	return request<T>(input, { query });
}

/** POST 请求（body 自动 JSON 序列化，FormData 原样透传） */
export function apiPost<T>(
	input: string,
	body?: unknown,
	init?: ApiRequestOptions,
): Promise<T> {
	return request<T>(input, { ...init, method: "POST", body });
}
