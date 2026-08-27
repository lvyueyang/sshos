/**
 * AI 对话服务端逻辑（SFn 流式，docs 技术架构 §5.2 / §8）：
 * guardChatInput 注入检测 → Pi Agent 会话 → 事件流转 AiTextDelta 增量流
 * （SFn 返回 ReadableStream，客户端逐块消费）。
 * 工具 handler 内部走 execCommandSFn（命令经 Policy Engine 二次拦截，无绕过路径）。
 * 纯服务端模块，由 aiChatSFn 动态 import，避免进入 client bundle。
 */

import { logger } from "#/lib/logger/logger.server";
import {
	ApprovalRequiredError,
	PolicyError,
} from "#/services/ai/approval/registry";
import { execWithPolicy } from "#/services/ssh/command/exec.service";
import { ensureSftp, sftpManager } from "#/services/ssh/sftp/sftp.server";
import { type AgentTools, createPiAgent } from "../pi-agent";
import { guardChatInput } from "../security/prompt-guard";
import type { AiChatMessage, AiStreamChunk } from "./chat.schemas";

/** 命令卡片携带的输出上限（模型上下文仍收完整 stdout，仅推送客户端时截断） */
const MAX_TOOL_OUTPUT = 8 * 1024;

/** 构造 AI 对话增量流（SFn 流式）：注入检测 → Pi 生成 → AiStreamChunk 流 */
export async function createAiChatStream(
	sessionId: string,
	messages: AiChatMessage[],
): Promise<ReadableStream<AiStreamChunk>> {
	guardChatInput(messages);

	const tools: AgentTools = {
		execCommand: async (command) => {
			// 命令执行结果同时透出 tool-call 帧（客户端渲染三态命令卡片，docs/07 §6）；
			// 分类取自策略引擎：PolicyError=block / ApprovalRequiredError=review / 成功=safe
			let classification: "safe" | "review" | "block" = "safe";
			let result: "success" | "failure" = "success";
			let output = "";
			const emitToolCall = () => {
				try {
					streamController?.enqueue({
						type: "tool-call",
						command,
						classification,
						result,
						// 截断后再推给客户端（避免大 stdout 整包进 renderer，docs/07 §6）
						output: output ? output.slice(0, MAX_TOOL_OUTPUT) : undefined,
					});
				} catch {
					// 流已关闭则忽略（命令卡片不阻塞对话流）
				}
			};
			try {
				const stdout = await execWithPolicy(sessionId, command);
				output = stdout.trim();
				classification = "safe";
				result = "success";
				emitToolCall();
				return { isError: false, content: output || "(无输出)" };
			} catch (err) {
				if (err instanceof PolicyError) {
					classification = "block";
					output = err.message;
				} else if (err instanceof ApprovalRequiredError) {
					classification = "review";
					output = err.message;
				} else {
					output = err instanceof Error ? err.message : String(err);
				}
				result = "failure";
				emitToolCall();
				// PolicyError / ApprovalRequiredError 统一转为工具错误，模型据此向用户说明
				return { isError: true, content: output };
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
	// 控制器与关闭标记提升到流外：prompt 失败时也能结束流（否则客户端 loading 卡死）
	let streamController: ReadableStreamDefaultController<AiStreamChunk> | null =
		null;
	let closed = false;
	const closeStream = () => {
		if (!closed) {
			closed = true;
			streamController?.close();
		}
	};
	/** 推送错误帧并结束流（错误必须到达客户端，禁止静默吞错） */
	const fail = (message: string) => {
		if (closed) return;
		streamController?.enqueue({ type: "error", message });
		closeStream();
	};

	const stream = new ReadableStream<AiStreamChunk>({
		start(controller) {
			streamController = controller;
			// 未配置可用模型：直接推送错误帧，不再发起 prompt（实测 prompt 会 reject 且零事件）
			if (agent.modelFallbackMessage) {
				fail(
					`未配置可用模型，请到「系统设置 → 模型」配置 Provider API Key 并设置默认模型。\n${agent.modelFallbackMessage}`,
				);
				return;
			}
			// 部分模型只发 text_end（完整文本），用其兜底；已有 text_delta 增量则跳过避免重复
			let hasTextDelta = false;
			let sawToolCall = false;
			// pi 重试/失败明细：自定义端点不支持流式 / key 无效 / baseUrl 错误时，pi 重试后空返回
			const retryErrors: string[] = [];
			const enqueue = (delta: string) => {
				if (!closed) controller.enqueue({ type: "text-delta", delta });
			};
			agent.subscribe(
				(event: {
					type: string;
					text?: string;
					errorMessage?: string;
					finalError?: string;
					success?: boolean;
					willRetry?: boolean;
					assistantMessageEvent?: {
						type?: string;
						delta?: string;
						content?: string;
						error?: { stopReason?: string; errorMessage?: string };
					};
				}) => {
					if (event.type !== "message_update") {
						logger.info({ type: event.type }, "Pi 事件");
					}
					// 收集重试失败原因（自定义端点的流式 / 鉴权 / 路径问题通常在此暴露）
					if (event.type === "auto_retry_start" && event.errorMessage) {
						retryErrors.push(event.errorMessage);
					}
					if (
						event.type === "auto_retry_end" &&
						event.success === false &&
						event.finalError
					) {
						retryErrors.push(event.finalError);
					}
					// Pi 0.84.2 的文本增量在 message_update.assistantMessageEvent：
					// 部分模型产出 text_delta（增量），部分只发 text_end（完整文本），两者都处理
					if (event.type === "message_update") {
						const deltaEvent = event.assistantMessageEvent;
						if (deltaEvent?.type === "toolcall_start") {
							sawToolCall = true;
						} else if (
							deltaEvent?.type === "error" &&
							deltaEvent.error?.errorMessage
						) {
							retryErrors.push(deltaEvent.error.errorMessage);
						} else if (deltaEvent?.type === "text_delta" && deltaEvent.delta) {
							hasTextDelta = true;
							enqueue(deltaEvent.delta);
						} else if (
							deltaEvent?.type === "text_end" &&
							deltaEvent.content &&
							!hasTextDelta
						) {
							hasTextDelta = true;
							enqueue(deltaEvent.content);
						}
					}
					// turn_end / agent_end 每次尝试都触发（willRetry=true 表示还会重试），
					// 不能据此裁决空响应；agent_settled 才是整个 agent 运行结束的可靠信号。
					// 成功且有文本时提前关流（运行已无后续），避免 agent_settled 偶发缺失导致挂起
					if (
						event.type === "agent_end" &&
						event.willRetry === false &&
						hasTextDelta
					) {
						closeStream();
					}
					// agent_settled：全程无文本 → 透出失败原因（含 pi 重试明细与端点指引）
					if (event.type === "agent_settled") {
						if (!closed) {
							if (!hasTextDelta) {
								fail(buildEmptyResponseError(retryErrors, sawToolCall));
								return;
							}
							closeStream();
						}
					}
				},
			);
		},
	});

	// 无可用模型时已在 start 内推送错误帧，不再发起 prompt
	if (!agent.modelFallbackMessage) {
		// 历史消息作为本轮上下文传入（Pi 会话为请求级，无跨请求记忆）
		const promptText = messages.map((m) => m.content).join("\n");
		void agent.prompt(promptText).catch((err: Error) => {
			logger.warn({ err }, "Pi prompt 调用失败");
			// 失败必须把错误传给客户端，而不是只关流（否则"发送消息无提示"）
			fail(err instanceof Error ? err.message : String(err));
		});
	}

	return stream;
}

/**
 * 构造「模型未返回内容」错误帧：透出 pi 的真实失败原因，并给出针对
 * 自定义端点（OpenAI 兼容）的可执行排查指引。pi 对自定义端点强制
 * `stream:true` SSE 流式请求，非流式响应会报 "Stream ended without
 * finish_reason" 并重试后空返回（实测确认）。
 */
export function buildEmptyResponseError(
	retryErrors: string[],
	sawToolCall: boolean,
): string {
	if (sawToolCall) {
		return "模型仅执行了工具调用，未产生文本回复，请重试或换用支持工具调用的模型。";
	}
	const detail = retryErrors.at(-1);
	const base = "模型未返回任何内容";
	if (!detail) {
		return `${base}。请检查：① baseUrl 是否正确（OpenAI 兼容端点通常需以 /v1 结尾）；② API 类型是否与端点匹配；③ API Key 是否有效、网络是否可达。`;
	}
	const streamingIssue = /finish_reason|stream|chunk/i.test(detail);
	if (streamingIssue) {
		return `${base}（${detail}）。自定义端点必须支持 OpenAI SSE 流式返回（stream:true + data: 分块），请确认 baseUrl 指向正确的 /v1 端点且服务端开启流式。`;
	}
	return `${base}（${detail}）。请检查 baseUrl / API 类型 / API Key 是否正确、端点是否支持 OpenAI 流式与工具调用。`;
}
