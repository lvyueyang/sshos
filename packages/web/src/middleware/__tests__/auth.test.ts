/**
 * 鉴权中间件测试：AuthError 语义 + resolveAuthContext 鉴权分支
 * （bootstrap 未 ready 503 / 未配置 401 / token 缺失或无效 401 / 有效放行）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetBootstrapStatus, mockIsConfigured, mockVerifyJwt } = vi.hoisted(
	() => ({
		mockGetBootstrapStatus: vi.fn(),
		mockIsConfigured: vi.fn(),
		mockVerifyJwt: vi.fn(),
	}),
);

vi.mock("#/services/bootstrap/status", () => ({
	getBootstrapStatus: mockGetBootstrapStatus,
}));

vi.mock("#/services/auth/core/config", () => ({
	readServerConfig: () => ({ serverSecret: "test-secret" }),
	isConfigured: mockIsConfigured,
}));

vi.mock("#/services/auth/core/jwt", () => ({
	verifyJwt: mockVerifyJwt,
}));

import { AuthError, resolveAuthContext } from "#/middleware/auth-guard";

describe("AuthError", () => {
	it("携带 statusCode，name 为 AuthError", () => {
		const err = new AuthError("未登录或登录已过期", 401);
		expect(err.statusCode).toBe(401);
		expect(err.name).toBe("AuthError");
		expect(err).toBeInstanceOf(Error);
	});
});

describe("resolveAuthContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("bootstrap 未 ready 时抛 503（初始化中，业务一律拒绝）", async () => {
		mockGetBootstrapStatus.mockReturnValue({
			phase: "running",
			step: "migrations",
		});
		await expect(resolveAuthContext("token")).rejects.toMatchObject({
			statusCode: 503,
		});
		expect(mockIsConfigured).not.toHaveBeenCalled();
	});

	it("未配置启动密码时抛 401", async () => {
		mockGetBootstrapStatus.mockReturnValue({ phase: "ready", step: null });
		mockIsConfigured.mockReturnValue(false);
		await expect(resolveAuthContext("token")).rejects.toMatchObject({
			statusCode: 401,
		});
	});

	it("token 缺失时抛 401", async () => {
		mockGetBootstrapStatus.mockReturnValue({ phase: "ready", step: null });
		mockIsConfigured.mockReturnValue(true);
		await expect(resolveAuthContext(undefined)).rejects.toMatchObject({
			statusCode: 401,
		});
		expect(mockVerifyJwt).not.toHaveBeenCalled();
	});

	it("token 验签失败时抛 401", async () => {
		mockGetBootstrapStatus.mockReturnValue({ phase: "ready", step: null });
		mockIsConfigured.mockReturnValue(true);
		mockVerifyJwt.mockReturnValue(null);
		await expect(resolveAuthContext("bad-token")).rejects.toMatchObject({
			statusCode: 401,
		});
	});

	it("有效 token 返回鉴权上下文", async () => {
		mockGetBootstrapStatus.mockReturnValue({ phase: "ready", step: null });
		mockIsConfigured.mockReturnValue(true);
		mockVerifyJwt.mockReturnValue({ sub: "local" });
		await expect(resolveAuthContext("valid-token")).resolves.toEqual({
			authenticated: true,
		});
	});
});
