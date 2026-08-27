/**
 * 全局鉴权豁免逻辑单元测试（决策记录 D21）
 */

import { describe, expect, it } from "vitest";
import { registerPublicSfn } from "#/lib/public-sfns/public-sfns";
import { isProtected } from "../auth";

describe("isProtected（全局鉴权豁免）", () => {
	it("未注册公开的 SFn 一律受保护", () => {
		expect(isProtected("/_serverFn/abc123", "serverFn")).toBe(true);
	});

	it("注册为公开的 SFn 豁免（auth setup/login/status 等）", () => {
		const url = "/_serverFn/public-login";
		registerPublicSfn(url);
		expect(isProtected(url, "serverFn")).toBe(false);
	});

	it("/api/* 路由受保护（health 除外）", () => {
		expect(isProtected("/api/anything", "router")).toBe(true);
	});

	it("/api/health 自检豁免", () => {
		expect(isProtected("/api/health", "router")).toBe(false);
	});

	it("页面与静态资源豁免", () => {
		expect(isProtected("/", "router")).toBe(false);
		expect(isProtected("/assets/index-x.js", "router")).toBe(false);
	});
});
