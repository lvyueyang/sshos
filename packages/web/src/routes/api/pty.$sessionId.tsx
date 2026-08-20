/**
 * PTY 输出流 Server Route（docs 技术架构 §5.2 / W0 spike）：
 * GET /api/pty/:sessionId 推送 PTY 输出（ReadableStream）。
 * 多终端场景按 ptyId 精确订阅，见 docs 技术架构 §5.6。
 * 服务端依赖在 handler 内动态 import，避免进入 client bundle（import-protection）。
 */

import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/pty/$sessionId", {
	server: {
		handlers: {
			GET: async ({ params }) => {
				const [{ Readable }, { ptyManager }] = await Promise.all([
					import("node:stream"),
					import("#/services/ssh/ssh.server"),
				]);
				// 单终端 spike：取该会话当前 pty；多终端时客户端传 ptyId 精确订阅
				const pty = ptyManager.getBySession(params.sessionId);
				if (!pty) {
					return new Response("PTY 会话不存在", { status: 404 });
				}
				const web = Readable.toWeb(pty.output) as ReadableStream;
				return new Response(web, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		},
	},
});
