/**
 * W0 spike 专用 Server Route：用 SSH_TEST_* 环境变量建立会话并发送输入。
 * 临时验证通道（验证 PTY / metrics 三条流的 HTTP 流式 + 延迟），W1 接入 connectSFn 后删除。
 *
 * POST /api/spike/connect   -> { sessionId, ptyId }
 * POST /api/spike/sendInput -> { ok: true }
 */

import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/spike", {
	server: {
		handlers: {
			POST: async ({ request }) => {
				const [{ ptyManager, sshManager }, { json, jsonResponse }] =
					await Promise.all([
						import("#/services/ssh/ssh.server"),
						import("#/lib/json"),
					]);
				const body = await json<{
					action: "connect" | "sendInput";
					sessionId?: string;
					ptyId?: string;
					data?: string;
				}>(request);

				if (body.action === "connect") {
					const host = process.env.SSH_TEST_HOST;
					if (!host) {
						return new Response("SSH_TEST_HOST 未设置", { status: 500 });
					}
					const session = await sshManager.connect({
						connectionId: 0,
						host,
						port: Number(process.env.SSH_TEST_PORT ?? 2222),
						username: process.env.SSH_TEST_USER ?? "test",
						authType: "password",
						password: process.env.SSH_TEST_PASSWORD ?? "testpass",
					});
					const pty = await ptyManager.create(session.client, {
						sessionId: session.sessionId,
						cols: 80,
						rows: 24,
					});
					return jsonResponse({
						sessionId: session.sessionId,
						ptyId: pty.ptyId,
					});
				}

				if (body.action === "sendInput" && body.ptyId && body.data) {
					ptyManager.get(body.ptyId).channel.write(body.data);
					return jsonResponse({ ok: true });
				}

				return new Response("未知 action", { status: 400 });
			},
		},
	},
});
