/**
 * ssh:// 深链解析单元测试（docs 界面设计 §4.6）
 */

import { describe, expect, it } from "vitest";
import { parseSshDeepLink } from "../use-deep-link";

describe("parseSshDeepLink", () => {
	it("解析完整 ssh://user@host:port", () => {
		expect(parseSshDeepLink("ssh://test@localhost:2222")).toEqual({
			host: "localhost",
			port: 2222,
			username: "test",
		});
	});

	it("无端口时默认 22", () => {
		expect(parseSshDeepLink("ssh://root@10.0.0.1")).toEqual({
			host: "10.0.0.1",
			port: 22,
			username: "root",
		});
	});

	it("无用户名时为空串", () => {
		expect(parseSshDeepLink("ssh://example.com")).toEqual({
			host: "example.com",
			port: 22,
			username: "",
		});
	});

	it("IPv6 主机去除方括号", () => {
		expect(parseSshDeepLink("ssh://user@[::1]:2222")).toEqual({
			host: "::1",
			port: 2222,
			username: "user",
		});
	});

	it("非法 URL 返回空 host", () => {
		expect(parseSshDeepLink("not a url")).toEqual({
			host: "",
			port: 22,
			username: "",
		});
	});
});
