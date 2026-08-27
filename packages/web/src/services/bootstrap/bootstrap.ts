/**
 * 启动初始化（bootstrap）：服务启动时立即执行一次（仅启动时），非阻塞后台运行——
 * 服务可即时响应 /api/bootstrap/status，前端据此渲染"初始化中"载入界面。
 * 初始化失败即 fail-fast 退出（启动初始化失败等同于服务无法运行，类似开机动画失败）。
 */

import { runMigrations } from "#/db/migrate";
import { runSeed } from "#/db/seed";
import { logger } from "#/lib/logger/logger.server";
import { setBootstrapReady, setBootstrapRunning } from "./status";

let started = false;

async function runBootstrapOnce(): Promise<void> {
	try {
		setBootstrapRunning("migrations");
		await runMigrations();
		setBootstrapRunning("seed");
		await runSeed();
		setBootstrapReady();
		logger.info("bootstrap 完成");
	} catch (error) {
		// fail-fast：启动初始化失败服务无法运行，同步打 stderr（stdio 继承到宿主/终端）后退出
		const detail =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		console.error(`[bootstrap] 初始化失败，fail-fast 退出\n${detail}`);
		logger.error({ err: error }, "bootstrap 初始化失败");
		process.exit(1);
	}
}

/** 触发初始化（幂等：仅首次调用执行；server.ts 启动时调用一次） */
export function runBootstrap(): void {
	if (started) return;
	started = true;
	void runBootstrapOnce();
}
