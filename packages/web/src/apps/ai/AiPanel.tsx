/**
 * AI 助手面板（docs 界面设计 §5 / W3）：消费 aiChatSFn 的 AiTextDelta 增量流
 * （SFn 流式返回，逐块读取），自己维护消息列表与流式渲染。工具调用在服务端执行
 * （命令经 Policy Engine）；review 级命令在服务端挂起审批，面板轮询
 * listPendingApprovalsSFn 弹出审批弹窗，批准后 approvalSFn 重放执行（无绕过路径）。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
	approvalSFn,
	listPendingApprovalsSFn,
} from "#/approval/approval.functions";
import {
	ApprovalDialog,
	type PendingApproval,
} from "#/components/ApprovalDialog";
import { useUiStore } from "#/stores/ui";
import { AuditHistoryPanel } from "./AuditHistoryPanel";
import { aiChatSFn } from "./ai.functions";
import type { AiStreamChunk } from "./ai.schemas";

interface AiPanelProps {
	sessionId: string;
}

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export function AiPanel({ sessionId }: AiPanelProps) {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [loading, setLoading] = useState(false);
	const [approval, setApproval] = useState<PendingApproval | null>(null);
	const [showHistory, setShowHistory] = useState(false);
	const queryClient = useQueryClient();
	// 对话流取消：AI 窗口关闭（组件卸载）时中止进行中的请求与流读取
	const abortRef = useRef<AbortController | null>(null);
	useEffect(() => () => abortRef.current?.abort(), []);

	// 安装引导的「AI 对话式安装」：消费一次性预填提示（信号变化时读取，匹配本会话才预填）
	const aiInstallSignal = useUiStore((s) => s.aiInstallSignal);
	useEffect(() => {
		if (aiInstallSignal === 0) return;
		const prompt = useUiStore.getState().consumeAiInstall(sessionId);
		if (prompt) {
			setInput(prompt.prompt);
		}
	}, [aiInstallSignal, sessionId]);

	// 轮询挂起审批：AI 命令被 review 拦截后弹窗确认
	useEffect(() => {
		if (!sessionId) return;
		const timer = setInterval(() => {
			void listPendingApprovalsSFn({ data: { sessionId } })
				.then((pending) => {
					if (pending.length > 0) setApproval(pending[0]);
				})
				.catch(() => {});
		}, 2_000);
		return () => clearInterval(timer);
	}, [sessionId]);

	/** 审批决策：批准（服务端重放执行原命令）或拒绝；完成后刷新审计历史 */
	const decideApproval = useMutation({
		mutationFn: async (decision: "approved" | "rejected") => {
			await approvalSFn({
				data: { requestId: approval?.requestId ?? "", decision },
			});
		},
		onSuccess: () => {
			setApproval(null);
			void queryClient.invalidateQueries({
				queryKey: ["audit-logs", sessionId],
			});
		},
	});

	/** 追加一条 assistant 流式消息的增量文本 */
	const appendAssistantDelta = (delta: string) => {
		setMessages((prev) => {
			const copy = [...prev];
			const last = copy[copy.length - 1];
			copy[copy.length - 1] = {
				role: "assistant",
				content: (last?.content ?? "") + delta,
			};
			return copy;
		});
	};

	/** 结束当前 assistant 消息为错误/提示（保留已有部分文本，避免吞掉内容） */
	const finishAssistantWith = (label: string, message: string) => {
		setMessages((prev) => {
			const copy = [...prev];
			const last = copy[copy.length - 1] ?? {
				role: "assistant" as const,
				content: "",
			};
			const prefix = last.content ? "\n\n" : "";
			copy[copy.length - 1] = {
				role: "assistant",
				content: `${last.content}${prefix}[${label}] ${message}`,
			};
			return copy;
		});
	};

	const send = async () => {
		const text = input.trim();
		if (!text || loading) return;
		setInput("");
		const history = [...messages, { role: "user" as const, content: text }];
		setMessages([...history, { role: "assistant", content: "" }]);
		setLoading(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const stream = await aiChatSFn({
				data: { sessionId, messages: history },
				signal: controller.signal,
			});
			// 消费流：error 帧 / 空响应 / 正常增量三种终态都必须有可见反馈
			const result = await consumeDeltaStream(
				stream,
				appendAssistantDelta,
				controller.signal,
			);
			if (result.type === "error") {
				finishAssistantWith("错误", result.message);
			} else if (!result.hasContent) {
				finishAssistantWith(
					"提示",
					"模型未返回任何内容。请检查 baseUrl（需以 /v1 结尾）、API 类型、API Key，以及端点是否支持 OpenAI 流式与工具调用。",
				);
			}
		} catch (err) {
			// 窗口关闭主动取消：静默结束，不展示错误
			if ((err as Error).name === "AbortError") return;
			const msg = err instanceof Error ? err.message : String(err);
			finishAssistantWith("请求失败", msg);
		} finally {
			setLoading(false);
			if (abortRef.current === controller) abortRef.current = null;
		}
	};

	return (
		<div className="flex h-full flex-col bg-transparent">
			{/* 消息列表 */}
			<div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
				{messages.length === 0 && (
					<div className="text-xs" style={{ color: "var(--muted)" }}>
						用自然语言描述任务，例如「查看磁盘使用情况」或「列出 /tmp
						下所有文件」。
					</div>
				)}
				{messages.map((msg, i) => (
					<MessageBubble key={i} msg={msg} />
				))}
			</div>

			{/* 审计历史（docs 界面设计 §8.7：历史按钮展开） */}
			{showHistory && <AuditHistoryPanel sessionId={sessionId} />}

			{/* 输入区 */}
			<div
				className="flex shrink-0 gap-2 border-t p-2"
				style={{ borderColor: "var(--rule)" }}
			>
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && void send()}
					disabled={loading}
					placeholder={loading ? "AI 思考中…" : "输入指令…"}
					className="flex-1 rounded border px-2 py-1.5 text-sm outline-none disabled:opacity-60"
					style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
				/>
				<button
					type="button"
					onClick={() => setShowHistory((v) => !v)}
					title={showHistory ? "收起审计日志" : "展开审计日志"}
					className="rounded border px-2 py-1.5 text-sm disabled:opacity-50"
					style={{
						borderColor: "var(--rule)",
						color: showHistory ? "var(--accent)" : "var(--muted)",
					}}
				>
					🕘
				</button>
				<button
					type="button"
					onClick={() => void send()}
					disabled={loading}
					className="rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
					style={{ background: "var(--accent)" }}
				>
					发送
				</button>
			</div>

			{/* 审批弹窗（AI 命令 review 拦截时弹出） */}
			{approval && (
				<ApprovalDialog
					approval={approval}
					onDecision={(decision) => decideApproval.mutateAsync(decision)}
					onClose={() => setApproval(null)}
				/>
			)}
		</div>
	);
}

/** 消息气泡：user 右对齐，assistant 左对齐 */
function MessageBubble({ msg }: { msg: ChatMessage }) {
	const isUser = msg.role === "user";
	return (
		<div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
			<div
				className="max-w-[85%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm"
				style={{
					background: isUser ? "var(--accent)" : "var(--bg3)",
					borderColor: "var(--rule)",
					color: isUser ? "#fff" : "var(--ink)",
				}}
			>
				{msg.content}
			</div>
		</div>
	);
}

/** 消费 aiChatSFn 的 AiStreamChunk 流（typed stream），逐块回调增量文本。
 * 返回终态：error 帧（含消息）或正常结束（是否产出过内容）。 */
async function consumeDeltaStream(
	stream: ReadableStream<AiStreamChunk>,
	onDelta: (delta: string) => void,
	signal: AbortSignal,
): Promise<
	{ type: "ok"; hasContent: boolean } | { type: "error"; message: string }
> {
	const reader = stream.getReader();
	let hasContent = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done || signal.aborted) break;
		if (value?.type === "text-delta" && value.delta) {
			hasContent = true;
			onDelta(value.delta);
		} else if (value?.type === "error") {
			// error 为服务端终止帧，读完即返回
			return { type: "error", message: value.message };
		}
	}
	return { type: "ok", hasContent };
}
