/**
 * AI 对话流 Server Route（docs 技术架构 §5.2 / §8 / W3）：
 * POST /api/ai/chat，body = { sessionId, messages }，返回 SSE 流（text-delta 帧）。
 * 服务端依赖（Pi SDK / SFTP）在 handler 内动态 import，避免进入 client bundle（import-protection）。
 */

import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/ai/chat", {
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = (await request.json()) as {
					sessionId?: string;
					messages?: unknown[];
				};
				const sessionId = body.sessionId ?? "";
				const messages = (
					(body.messages as Array<{
						role?: "user" | "assistant";
						content?: string;
					}>) ?? []
				).map((m) => ({
					role: (m.role === "assistant" ? "assistant" : "user") as
						| "user"
						| "assistant",
					content: m.content ?? "",
				}));
				if (!sessionId) {
					return new Response("缺少 sessionId", { status: 400 });
				}
				const { createAiChatResponse } = await import(
					"#/apps/ai/ai.chat.server"
				);
				return createAiChatResponse(sessionId, messages);
			},
		},
	},
});
