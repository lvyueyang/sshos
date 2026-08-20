/**
 * Nitro server entry：根目录 server.ts 被 Nitro 自动检测为服务端入口。
 * 业务 RPC / 流式 / health 全部由 SFn 与 Server Route 承载，零 Hono（决策记录 D2）。
 * 启动时执行数据库迁移（fail-fast）；SSR 由 tanstackStart 的 Nitro 集成（ssr service）自动处理。
 */

import { runMigrations } from "./src/db/migrate";

await runMigrations();

export default {
	async fetch(): Promise<Response | undefined> {
		// 返回 undefined 让 Nitro 继续到 tanstackStart SSR（对齐 fsdx server.ts 模式）
		return undefined;
	},
};
