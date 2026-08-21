/**
 * Nitro server entry：根目录 server.ts 被 Nitro 自动检测为服务端入口。
 * 业务 RPC / 流式 / health 全部由 SFn 与 Server Route 承载，零 Hono（决策记录 D2）。
 * 启动时执行数据库迁移与预置数据（fail-fast）；注册信号处理器，退出前强制刷新审计缓冲。
 * SSR 由 tanstackStart 的 Nitro 集成（ssr service）自动处理。
 */

import { runMigrations } from "./src/db/migrate";
import { runSeed } from "./src/db/seed";
import { batchWriter } from "./src/lib/batch-writer";

await runMigrations();
await runSeed();

// 优雅关闭：进程退出信号到达时先刷空审计缓冲再退出（docs 技术架构 §7.8）
for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => {
		void batchWriter.flushOnExit().finally(() => process.exit(0));
	});
}

export default {
	async fetch(): Promise<Response | undefined> {
		// 返回 undefined 让 Nitro 继续到 tanstackStart SSR（对齐 fsdx server.ts 模式）
		return undefined;
	},
};
