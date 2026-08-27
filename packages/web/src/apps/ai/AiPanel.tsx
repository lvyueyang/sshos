/**
 * AI 助手面板（docs 界面设计 §5 / W3）：消费 aiChatSFn 的 AiTextDelta 增量流
 * （SFn 流式返回，逐块读取），自己维护消息列表与流式渲染。工具调用在服务端执行
 * （命令经 Policy Engine）；review 级命令在服务端挂起审批，面板轮询
 * listPendingApprovalsSFn 弹出审批弹窗，批准后 approvalSFn 重放执行（无绕过路径）。
 * 视觉走 shadcn + motion 气泡动效（docs/06 §7）。
 */

import {
	RiHistoryLine,
	RiLoader4Line,
	RiSendPlaneLine,
} from "@remixicon/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
	ApprovalDialog,
	type PendingApproval,
} from "#/components/ApprovalDialog";
import {
	CommandCard,
	type CommandCardData,
} from "#/components/shared/CommandCard";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	approvalSFn,
	listPendingApprovalsSFn,
} from "#/services/ai/approval/approval.functions";
import { aiChatSFn } from "#/services/ai/chat/chat.functions";
import type { AiStreamChunk } from "#/services/ai/chat/chat.schemas";
import { useUiStore } from "#/stores/ui";
import { cn } from "#/utils";
import { AuditHistoryPanel } from "./AuditHistoryPanel";

interface AiPanelProps {
	sessionId: string;
}

interface ChatMessage {
	role: "user" | "assistant";
	content: string;
	/** 用户态不携带；assistant 消息关联的策略命令卡片（tool-call 帧） */
	commands?: CommandCardData[];
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
				commands: last.commands,
			};
			return copy;
		});
	};

	/** 追加一条命令卡片到当前 assistant 消息（tool-call 帧） */
	const appendToolCall = (card: CommandCardData) => {
		setMessages((prev) => {
			const copy = [...prev];
			const last = copy[copy.length - 1];
			if (last?.role !== "assistant") return copy;
			copy[copy.length - 1] = {
				...last,
				commands: [...(last.commands ?? []), card],
			};
			return copy;
		});
	};

	const send = async () => {
		const text = input.trim();
		if (!text || loading) return;
		setInput("");
		// 请求上下文剥离命令卡片（命令卡片是展示态，不进入模型上下文）
		const history = [
			...messages.map((m) => ({ role: m.role, content: m.content })),
			{ role: "user" as const, content: text },
		];
		// 展示状态追加（保留历史消息的命令卡片，跨轮不丢失）
		setMessages([
			...messages,
			{ role: "user", content: text },
			{ role: "assistant", content: "" },
		]);
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
				appendToolCall,
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
		<div className="flex h-full flex-col">
			{/* 消息列表 */}
			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
				{messages.length === 0 && (
					<div className="text-xs text-muted-foreground">
						用自然语言描述任务，例如「查看磁盘使用情况」或「列出 /tmp
						下所有文件」。
					</div>
				)}
				<AnimatePresence initial={false}>
					{messages.map((msg, i) => (
						<MessageBubble key={i} msg={msg} />
					))}
				</AnimatePresence>
			</div>

			{/* 审计历史（docs 界面设计 §8.7：历史按钮展开） */}
			{showHistory && <AuditHistoryPanel sessionId={sessionId} />}

			{/* 输入区 */}
			<div className="flex shrink-0 gap-2 border-t border-border p-2">
				<Input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && void send()}
					disabled={loading}
					placeholder={loading ? "AI 思考中…" : "输入指令…"}
					className="flex-1"
				/>
				<Button
					variant="outline"
					size="icon"
					type="button"
					title={showHistory ? "收起审计日志" : "展开审计日志"}
					aria-label={showHistory ? "收起审计日志" : "展开审计日志"}
					className={cn(
						"shrink-0",
						showHistory && "border-primary text-primary",
					)}
					onClick={() => setShowHistory((v) => !v)}
				>
					<RiHistoryLine className="size-4" />
				</Button>
				<Button type="button" disabled={loading} onClick={() => void send()}>
					{loading ? (
						<RiLoader4Line className="size-4 animate-spin" />
					) : (
						<RiSendPlaneLine className="size-4" />
					)}
					发送
				</Button>
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

/** 消息气泡：user 右对齐（primary 淡底），assistant 左对齐（muted 底），进出场动画 */
function MessageBubble({ msg }: { msg: ChatMessage }) {
	const isUser = msg.role === "user";
	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
			className={cn("flex", isUser ? "justify-end" : "justify-start")}
		>
			<div
				className={cn(
					"max-w-[85%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm",
					isUser
						? "border-primary/30 bg-primary/10 text-foreground"
						: "border-border bg-muted text-foreground",
				)}
			>
				{msg.content}
				{/* 策略命令卡片（safe/review/block 三态，docs/07 §6） */}
				{msg.commands?.map((card, i) => (
					<CommandCard key={i} card={card} />
				))}
			</div>
		</motion.div>
	);
}

/** 消费 aiChatSFn 的 AiStreamChunk 流（typed stream），逐块回调增量文本。
 * 返回终态：error 帧（含消息）或正常结束（是否产出过内容）。 */
async function consumeDeltaStream(
	stream: ReadableStream<AiStreamChunk>,
	onDelta: (delta: string) => void,
	onToolCall: (card: CommandCardData) => void,
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
		} else if (value?.type === "tool-call") {
			onToolCall(value);
		} else if (value?.type === "error") {
			// error 为服务端终止帧，读完即返回
			return { type: "error", message: value.message };
		}
	}
	return { type: "ok", hasContent };
}
