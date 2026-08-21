/**
 * 全局鉴权中间件豁免逻辑单元测试（决策记录 D19）
 */

import { describe, expect, it } from "vitest";
import { isProtected } from "../auth";

describe("isProtected（全局鉴权豁免）", () => {
	it("SFn 调用一律受保护", () => {
		expect(isProtected("/_serverFn/xxx", "serverFn")).toBe(true);
	});

	it("/api/* 路由受保护（health 除外）", () => {
		expect(isProtected("/api/pty/1", "router")).toBe(true);
		expect(isProtected("/api/sftp/download", "router")).toBe(true);
		expect(isProtected("/api/deeplink", "router")).toBe(true);
		expect(isProtected("/api/ai/chat", "router")).toBe(true);
	});

	it("/api/health 自检豁免", () => {
		expect(isProtected("/api/health", "router")).toBe(false);
	});

	it("页面与静态资源豁免", () => {
		expect(isProtected("/", "router")).toBe(false);
		expect(isProtected("/assets/index-x.js", "router")).toBe(false);
	});
});
