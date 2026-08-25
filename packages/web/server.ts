/**
 * Nitro server entry：根目录 server.ts 被 Nitro 自动检测为服务端入口。
 * 业务 RPC / 流式 / health 全部由 SFn 与 Server Route 承载，零 Hono（决策记录 D2）。
 * 启动流程：先按 server.json 设置监听地址（默认仅本机，见 D21），随后**非阻塞**触发
 * bootstrap（数据库迁移 + 预置数据，后台执行，fail-fast；前端经 /api/bootstrap/status
 * 渲染初始化载入界面）；注册信号处理器，退出前强制刷新审计缓冲。
 * SSR 由 tanstackStart 的 Nitro 集成（ssr service）自动处理。
 */

import { readServerConfig } from "#/services/auth/config";
import { runBootstrap } from "#/services/bootstrap/bootstrap";
import { batchWriter } from "./src/lib/batch-writer";

// 监听地址必须显式设置：Nitro preset 未设 NITRO_HOST 时默认绑定所有接口（0.0.0.0）。
// server.json 的 port/bind 优先（手工编辑后重启生效）；未配置或未指定时收紧到仅本机。
// 本模块在 Nitro preset 入口 body 读取 env 之前求值，此处写入可被 preset 消费（ESM 依赖先于入口执行）。
function applyServerConfig(): void {
	const cfg = readServerConfig();
	process.env.NITRO_HOST = cfg?.bind || process.env.NITRO_HOST || "127.0.0.1";
	if (cfg?.port) process.env.NITRO_PORT = String(cfg.port);
}
applyServerConfig();

// 非阻塞触发初始化（仅启动时执行一次）：服务即刻可响应 status 查询，前端显示载入界面
runBootstrap();

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
