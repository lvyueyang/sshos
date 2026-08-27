/**
 * lib/request 单元测试：query 拼接、JSON body 序列化、鉴权头注入、非 2xx 抛错
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, request } from "../request";

/** 捕获 fetch 收到的请求，供断言 */
let captured: {
	input: RequestInfo | URL;
	init?: RequestInit;
};

beforeEach(() => {
	captured = { input: "" };
	vi.stubGlobal(
		"fetch",
		vi.fn(
			(input: RequestInfo | URL, init?: RequestInit) =>
				new Promise((resolve) => {
					captured = { input, init };
					resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
				}),
		),
	);
	// 模拟 logged-in：有 token 时请求应带 X-SSHOS-TOKEN
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => (k === "sshos.auth-token" ? "test-token" : null),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function fetchInit(): RequestInit {
	return captured.init ?? {};
}

describe("request 通用请求", () => {
	it("注入 X-SSHOS-TOKEN 鉴权头", async () => {
		await request("/api/x");
		expect(new Headers(fetchInit().headers).get("X-SSHOS-TOKEN")).toBe(
			"test-token",
		);
	});

	it("JSON body 序列化并设 Content-Type", async () => {
		await apiPost("/api/x", { a: 1 });
		const h = new Headers(fetchInit().headers);
		expect(h.get("Content-Type")).toBe("application/json");
		expect(fetchInit().body).toBe('{"a":1}');
	});

	it("FormData body 原样透传且不设 Content-Type", async () => {
		const fd = new FormData();
		fd.append("k", "v");
		await request("/api/x", { method: "POST", body: fd });
		const h = new Headers(fetchInit().headers);
		expect(h.has("Content-Type")).toBe(false);
		expect(fetchInit().body).toBe(fd);
	});

	it("解析 JSON 出参", async () => {
		const data = await request<{ ok: boolean }>("/api/x");
		expect(data).toEqual({ ok: true });
	});

	it("非 2xx 抛错并携带状态与响应文本", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(
					new Response("forbidden", { status: 403, statusText: "Forbidden" }),
				),
			),
		);
		await expect(request("/api/x")).rejects.toThrow(
			/请求失败 \(403\): forbidden/,
		);
	});

	it("响应文本为空时回退 statusText", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(new Response(null, { status: 500, statusText: "ERR" })),
			),
		);
		await expect(request("/api/x")).rejects.toThrow(/请求失败 \(500\): ERR/);
	});
});

describe("apiGet / query 拼接", () => {
	it("追加 query 参数并跳过 undefined", async () => {
		await apiGet("/api/x", { a: 1, b: "中文", c: undefined });
		expect(String(captured.input)).toBe("/api/x?a=1&b=%E4%B8%AD%E6%96%87");
	});

	it("保留既有 query 并合并新参数", async () => {
		await apiGet("/api/x?pre=0", { a: 2 });
		expect(String(captured.input)).toBe("/api/x?pre=0&a=2");
	});
});
