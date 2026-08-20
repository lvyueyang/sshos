/**
 * AI 对话服务端逻辑（Server Route 例外，docs 技术架构 §5.2 / §8）：
 * guardChatInput 注入检测 → Pi Agent 会话 → 事件流转 SSE（text-delta 帧）。
 * 工具 handler 内部走 execCommandSFn（命令经 Policy Engine 二次拦截，无绕过路径）。
 * 纯服务端模块，由 routes/api/ai.chat.tsx 动态 import，避免进入 client bundle。
 */

import { type AgentTools, createPiAgent } from "#/ai/pi-agent";
import { logger } from "#/lib/logger";
import { guardChatInput } from "#/middleware/prompt-guard";
import { ensureSftp, sftpManager } from "#/services/sftp/sftp.server";
import { execWithPolicy } from "./exec.service";

/** 对话消息（role 仅 user / assistant，system 由 guardChatInput 拒绝） */
export interface AiChatMessage {
	role: "user" | "assistant";
	content: string;
}

/** 构造 AI 对话 SSE 响应：注入检测 → Pi 生成 → text-delta 流 */
export async function createAiChatResponse(
	sessionId: string,
	messages: AiChatMessage[],
): Promise<Response> {
	guardChatInput(messages);

	const tools: AgentTools = {
		execCommand: async (command) => {
			try {
				const stdout = await execWithPolicy(sessionId, command);
				return { isError: false, content: stdout.trim() || "(无输出)" };
			} catch (err) {
				// PolicyError / ApprovalRequiredError 统一转为工具错误，模型据此向用户说明
				return {
					isError: true,
					content: err instanceof Error ? err.message : String(err),
				};
			}
		},
		readFile: async (path) => {
			try {
				await ensureSftp(sessionId);
				const stream = sftpManager.createReadStream(sessionId, path);
				let buf = "";
				for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
					buf += chunk.toString("utf-8");
					if (buf.length > 64 * 1024) {
						return {
							isError: false,
							content: `${buf}\n…(已截断 64KB)`,
						};
					}
				}
				return { isError: false, content: buf || "(空文件)" };
			} catch (err) {
				return {
					isError: true,
					content: err instanceof Error ? err.message : String(err),
				};
			}
		},
		listDir: async (path) => {
			try {
				await ensureSftp(sessionId);
				const entries = await sftpManager.list(sessionId, path);
				const lines = entries.map((e) => {
					const type = e.type === "directory" ? "dir" : e.type;
					return `${type}\t${e.name}\t${e.size}\t${e.mtime ?? ""}`;
				});
				return {
					isError: false,
					content: `[${path}] ${lines.length} 项\n${lines.join("\n")}`,
				};
			} catch (err) {
				return {
					isError: true,
					content: err instanceof Error ? err.message : String(err),
				};
			}
		},
	};

	const agent = await createPiAgent(tools);
	logger.info(
		{
			fallback: agent.modelFallbackMessage ?? null,
			tools: agent.session.getActiveToolNames(),
		},
		"Pi agent 已创建",
	);
	const encoder = new TextEncoder();
	// 控制器与关闭标记提升到流外：prompt 失败时也能结束流（否则客户端 loading 卡死）
	let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;
	let closed = false;
	const closeSse = () => {
		if (!closed) {
			closed = true;
			sseController?.close();
		}
	};
	const sse = new ReadableStream<Uint8Array>({
		start(controller) {
			sseController = controller;
			// 部分模型只发 text_end（完整文本），用其兜底；已有 text_delta 增量则跳过避免重复
			let hasTextDelta = false;
			const enqueue = (obj: unknown) => {
				if (!closed) {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
					);
				}
			};
			agent.subscribe((event: { type: string; text?: string }) => {
				if (event.type !== "message_update") {
					logger.info({ type: event.type }, "Pi 事件");
				}
				// Pi 0.84.2 的文本增量在 message_update.assistantMessageEvent：
				// 部分模型产出 text_delta（增量），部分只发 text_end（完整文本），两者都处理
				if (event.type === "message_update") {
					const deltaEvent = (
						event as {
							assistantMessageEvent?: {
								type?: string;
								delta?: string;
								content?: string;
							};
						}
					).assistantMessageEvent;
					if (deltaEvent?.type === "text_delta" && deltaEvent.delta) {
						hasTextDelta = true;
						enqueue({ type: "text-delta", delta: deltaEvent.delta });
					} else if (
						deltaEvent?.type === "text_end" &&
						deltaEvent.content &&
						!hasTextDelta
					) {
						enqueue({ type: "text-delta", delta: deltaEvent.content });
					}
				}
				// turn_end / agent_end 与失败路径都可能触发，必须防重复 close
				if (event.type === "turn_end" || event.type === "agent_end") {
					closeSse();
				}
			});
		},
	});

	// 历史消息作为本轮上下文传入（Pi 会话为请求级，无跨请求记忆）
	const promptText = messages.map((m) => m.content).join("\n");
	void agent.prompt(promptText).catch((err: Error) => {
		logger.warn({ err }, "Pi prompt 调用失败");
		// 失败也要结束流，否则客户端 consumeSse 永远等不到 done、loading 卡死
		closeSse();
	});

	return new Response(sse, {
		headers: { "Content-Type": "text/event-stream" },
	});
}
