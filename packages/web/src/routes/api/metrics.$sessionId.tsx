/**
 * 系统指标流 Server Route（docs 技术架构 §5.5 / W0 spike）：
 * GET /api/metrics/:sessionId 每 2s 推送一条 NDJSON 快照；客户端断开自动停止采样。
 * 服务端依赖在 handler 内动态 import，避免进入 client bundle（import-protection）。
 */

import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/metrics/$sessionId", {
	server: {
		handlers: {
			GET: async ({ params }) => {
				const [{ Readable }, { metricsCollector }] = await Promise.all([
					import("node:stream"),
					import("#/services/metrics/metrics.server"),
				]);
				const stream = metricsCollector.start(params.sessionId);
				const web = Readable.toWeb(
					stream as unknown as import("node:stream").Readable,
				) as ReadableStream;
				return new Response(web, {
					headers: { "Content-Type": "application/x-ndjson" },
				});
			},
		},
	},
});
