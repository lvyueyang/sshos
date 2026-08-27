/**
 * bootstrap 状态机单元测试：非阻塞启动、幂等单飞、失败 fail-fast 退出。
 * 模块级状态经 vi.resetModules 重置；mock 实例用 vi.hoisted 固定，
 * 避免 resetModules 后与顶层引用失联。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { runMigrationsMock, runSeedMock } = vi.hoisted(() => ({
	runMigrationsMock: vi.fn(),
	runSeedMock: vi.fn(),
}));

vi.mock("#/db/migrate", () => ({ runMigrations: runMigrationsMock }));
vi.mock("#/db/seed", () => ({ runSeed: runSeedMock }));
vi.mock("#/lib/logger/logger.server", () => ({
	logger: { info: vi.fn(), error: vi.fn() },
}));

/** 重置模块缓存后重新加载 bootstrap（重置模块级 started 状态） */
async function loadBootstrap() {
	vi.resetModules();
	return import("../index");
}

afterEach(() => {
	runMigrationsMock.mockClear();
	runSeedMock.mockClear();
});

describe("bootstrap 状态机", () => {
	it("启动时 phase 为 running，初始化完成后转 ready", async () => {
		runMigrationsMock.mockResolvedValue(undefined);
		runSeedMock.mockResolvedValue(undefined);
		const { getBootstrapStatus, runBootstrap } = await loadBootstrap();

		runBootstrap();
		expect(getBootstrapStatus().phase).toBe("running");

		await vi.waitFor(() => expect(getBootstrapStatus().phase).toBe("ready"));
		expect(getBootstrapStatus().step).toBeNull();
	});

	it("幂等：重复调用只初始化一次", async () => {
		runMigrationsMock.mockResolvedValue(undefined);
		runSeedMock.mockResolvedValue(undefined);
		const { runBootstrap } = await loadBootstrap();

		runBootstrap();
		runBootstrap();

		await vi.waitFor(() => expect(runMigrationsMock).toHaveBeenCalledTimes(1));
		expect(runSeedMock).toHaveBeenCalledTimes(1);
	});

	it("初始化失败 fail-fast：process.exit(1)", async () => {
		runMigrationsMock.mockRejectedValue(new Error("migrate boom"));
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const { runBootstrap } = await loadBootstrap();

		runBootstrap();

		await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
		exitSpy.mockRestore();
	});
});
