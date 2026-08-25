/**
 * AI 助手面板（docs 界面设计 §5 / W3）：手动消费 aiChatSFn 的 SSE 流（text-delta 帧），
 * 自己维护消息列表与流式渲染。工具调用在服务端执行（命令经 Policy Engine）；
 * review 级命令在服务端挂起审批，面板轮询 listPendingApprovalsSFn 弹出审批弹窗，
 * 批准后 approvalSFn 重放执行（无绕过路径）。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	approvalSFn,
	listPendingApprovalsSFn,
} from "#/approval/approval.functions";
import {
	ApprovalDialog,
	type PendingApproval,
} from "#/components/ApprovalDialog";
import { apiFetch } from "#/lib/api-fetch";
import { useUiStore } from "#/stores/ui";
import { AuditHistoryPanel } from "./AuditHistoryPanel";

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

	const send = async () => {
		const text = input.trim();
		if (!text || loading) return;
		setInput("");
		const history = [...messages, { role: "user" as const, content: text }];
		setMessages([...history, { role: "assistant", content: "" }]);
		setLoading(true);
		try {
			const res = await apiFetch("/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId, messages: history }),
			});
			if (!res.ok || !res.body) {
				throw new Error(`AI 服务不可用 (${res.status})`);
			}
			await consumeSse(res.body, appendAssistantDelta);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setMessages((prev) => [
				...prev.slice(0, -1),
				{ role: "assistant", content: `[请求失败] ${msg}` },
			]);
		} finally {
			setLoading(false);
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

/** 解析 aiChatSFn 的 SSE body（data: JSON 帧，type=text-delta），逐段回调增量文本 */
async function consumeSse(
	body: ReadableStream<Uint8Array>,
	onDelta: (delta: string) => void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";
		for (const event of events) {
			for (const line of event.split("\n")) {
				if (!line.startsWith("data:")) continue;
				const raw = line.slice(5).trim();
				if (!raw) continue;
				try {
					const data = JSON.parse(raw) as { type?: string; delta?: string };
					if (data.type === "text-delta" && data.delta) {
						onDelta(data.delta);
					}
				} catch {
					// 跳过半截 JSON（流式边界）
				}
			}
		}
	}
}
