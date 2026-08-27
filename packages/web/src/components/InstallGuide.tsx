/**
 * 缺失依赖安装引导（docs 发行版适配计划 §3）：
 * App 需要的远程工具缺失时展示三条路径——一键安装（走策略引擎 review 审批）、
 * 手动安装（展示可复制命令 / 步骤）、AI 对话式安装（唤起 AI 面板预填 prompt）。
 * 可选工具（optional）由 App 在用户主动触发时挂载本组件，必需工具由 App 自动挂载。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RemoteToolRequirement } from "#/app-framework/types";
import {
	ApprovalDialog,
	type PendingApproval,
} from "#/components/ApprovalDialog";
import {
	approvalSFn,
	listPendingApprovalsSFn,
} from "#/services/ai/approval/approval.functions";
import {
	getToolInstallInfoSFn,
	installToolSFn,
	probeToolsSFn,
} from "#/services/capabilities/remote/capabilities.functions";
import { useUiStore } from "#/stores/ui";
import { useDesktopStore } from "#/stores/windows";

interface InstallGuideProps {
	sessionId: string;
	requirement: RemoteToolRequirement;
	/** 探测结果：可用时本组件不渲染 */
	available: boolean;
	/** 安装成功后回调（App 据此重新探测 / 刷新） */
	onInstalled?: () => void;
}

/** 从 Tab store 反查 connectionId（AI 窗口按 Tab 打开） */
function connectionIdOf(sessionId: string): number | undefined {
	return useDesktopStore.getState().tabs.find((t) => t.sessionId === sessionId)
		?.connectionId;
}

/** 生成 AI 对话式安装的预填 prompt（含发行版上下文） */
function buildAiPrompt(toolId: string, label: string): string {
	return `请帮我在当前服务器上安装 ${label}（工具标识 ${toolId}）。先确认系统发行版与包管理器，再选择最合适的安装方式（包管理器或源码编译），并给出安装后的验证命令。`;
}

export function InstallGuide({
	sessionId,
	requirement,
	available,
	onInstalled,
}: InstallGuideProps) {
	const queryClient = useQueryClient();
	const [showManual, setShowManual] = useState(false);
	const [approval, setApproval] = useState<PendingApproval | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	// 安装信息（一键命令 / 手动步骤 / 提示）
	const { data: installInfo } = useQuery({
		queryKey: ["tool-install", sessionId, requirement.id],
		queryFn: () =>
			getToolInstallInfoSFn({
				data: { sessionId, toolId: requirement.id },
			}),
		enabled: Boolean(sessionId),
		staleTime: 60_000,
	});

	/** 安装成功后强制重新探测并刷新 App 能力查询（服务端缓存一并失效） */
	const refreshTools = () => {
		void probeToolsSFn({
			data: { sessionId, tools: [requirement.id], refresh: true },
		})
			.then(() => {
				void queryClient.invalidateQueries({
					queryKey: ["remote-tools", sessionId],
				});
			})
			.catch(() => {
				void queryClient.invalidateQueries({
					queryKey: ["remote-tools", sessionId],
				});
			});
	};

	/** 一键安装：包管理器写操作 → 策略 review → 审批弹窗 */
	const installMutation = useMutation({
		mutationFn: () =>
			installToolSFn({ data: { sessionId, toolId: requirement.id } }),
		onSuccess: () => {
			setNotice(`已安装 ${installInfo?.label ?? requirement.id}`);
			onInstalled?.();
			refreshTools();
		},
		onError: (err) => {
			const message = err instanceof Error ? err.message : String(err);
			// 被策略 review 挂起：查本会话挂起审批并弹窗；否则展示真实错误，不静默吞错
			void listPendingApprovalsSFn({ data: { sessionId } })
				.then((pending) => {
					if (pending.length > 0) {
						setApproval(pending[0]);
					} else {
						setNotice(`安装失败: ${message}`);
					}
				})
				.catch(() => {
					setNotice(`安装失败: ${message}`);
				});
		},
	});

	/** 审批决策：批准重放执行安装命令，随后刷新工具探测 */
	const decideApproval = async (decision: "approved" | "rejected") => {
		if (!approval) return;
		try {
			await approvalSFn({ data: { requestId: approval.requestId, decision } });
			setApproval(null);
			if (decision === "approved") {
				setNotice(`已批准安装 ${installInfo?.label ?? requirement.id}`);
				onInstalled?.();
				refreshTools();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setNotice(`审批执行失败: ${message}`);
		}
	};

	/** AI 对话式安装：预填 prompt 并唤起 AI 窗口 */
	const openAiInstall = () => {
		const connectionId = connectionIdOf(sessionId);
		if (!connectionId) return;
		useUiStore.getState().requestAiInstall({
			sessionId,
			prompt: buildAiPrompt(
				requirement.id,
				installInfo?.label ?? requirement.label,
			),
		});
		useDesktopStore.getState().openWindow(connectionId, "ai", {
			x: 160,
			y: 60,
			w: 420,
			h: 560,
		});
	};

	const copy = (text: string) => {
		void navigator.clipboard.writeText(text).then(() => {
			setNotice("命令已复制");
			setTimeout(() => setNotice(null), 2_000);
		});
	};

	// 工具可用时本组件不渲染（hooks 已全部声明，放在早返回前）
	if (available) return null;

	return (
		<div
			className="mb-2 rounded border px-3 py-2 text-xs"
			style={{
				background: "var(--bg3)",
				borderColor: "var(--warn)",
			}}
		>
			<div className="mb-1 flex items-center gap-2 font-medium">
				<span style={{ color: "var(--warn)" }}>
					缺少依赖：{installInfo?.label ?? requirement.label}
				</span>
				<span className="text-[11px]" style={{ color: "var(--muted)" }}>
					{requirement.neededFor.join(" / ")}
				</span>
			</div>
			{requirement.fallback && (
				<p className="mb-2" style={{ color: "var(--muted)" }}>
					{requirement.fallback}
				</p>
			)}

			{notice && (
				<p className="mb-2" style={{ color: "var(--accent)" }}>
					{notice}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					disabled={!installInfo?.command || installMutation.isPending}
					onClick={() => installMutation.mutate()}
					className="rounded px-2.5 py-1 font-medium text-white disabled:opacity-50"
					style={{ background: "var(--accent)" }}
				>
					{installMutation.isPending ? "安装中…" : "一键安装"}
				</button>
				<button
					type="button"
					onClick={() => setShowManual((v) => !v)}
					className="rounded border px-2.5 py-1"
					style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
				>
					{showManual ? "收起" : "手动安装"}
				</button>
				<button
					type="button"
					onClick={openAiInstall}
					className="rounded border px-2.5 py-1"
					style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
				>
					AI 帮我装
				</button>
			</div>

			{installInfo?.note && (
				<p className="mt-2" style={{ color: "var(--muted)" }}>
					{installInfo.note}
				</p>
			)}

			{showManual && (
				<div
					className="mt-2 space-y-1 rounded border p-2"
					style={{ borderColor: "var(--rule)" }}
				>
					{installInfo?.command ? (
						<code className="block break-all whitespace-pre-wrap">
							{installInfo.command}
						</code>
					) : (
						<p style={{ color: "var(--muted)" }}>
							当前发行版无法自动生成安装命令，可复制以下说明手动安装。
						</p>
					)}
					{installInfo?.manual && (
						<pre
							className="whitespace-pre-wrap"
							style={{ color: "var(--ink)" }}
						>
							{installInfo.manual}
						</pre>
					)}
					{installInfo?.command && (
						<button
							type="button"
							onClick={() => copy(installInfo.command!)}
							className="rounded border px-2 py-0.5"
							style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
						>
							复制命令
						</button>
					)}
				</div>
			)}

			{approval && (
				<ApprovalDialog
					approval={approval}
					onDecision={decideApproval}
					onClose={() => setApproval(null)}
				/>
			)}
		</div>
	);
}
