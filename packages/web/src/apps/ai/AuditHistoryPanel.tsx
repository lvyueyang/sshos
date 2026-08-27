/**
 * AI 审计历史面板（docs 界面设计 §8.7）：展示当前会话的 AI 触发命令执行记录。
 * 查询 listLogsSFn（ai_audit + policy_decision），显示时间 / 命令 / 级别 / 结果 / 耗时；
 * 与 Policy Engine 三级命名一致：safe 绿 / review 黄 / block 红（语义 token）。
 */

import { useQuery } from "@tanstack/react-query";
import {
	ACTION_LABEL,
	formatDuration,
	formatTime,
	LEVEL_COLOR,
	truncateCommand,
} from "#/lib/logs-format";
import { listLogsSFn } from "#/services/logs/audit/audit.functions";

interface AuditHistoryPanelProps {
	sessionId: string;
}

/** 结果 + 耗时合并展示（如「已执行 · 0.3s」） */
function formatResult(entry: {
	action?: string | null;
	detail?: string | null;
}): string {
	const action = ACTION_LABEL[entry.action ?? ""] ?? entry.action ?? "";
	const duration = formatDuration(entry.detail);
	return duration ? `${action} · ${duration}` : action;
}

export function AuditHistoryPanel({ sessionId }: AuditHistoryPanelProps) {
	const { data, isPending } = useQuery({
		queryKey: ["audit-logs", sessionId],
		queryFn: () =>
			listLogsSFn({
				data: {
					sessionId,
					types: ["ai_audit", "policy_decision"],
					limit: 50,
				},
			}),
	});

	return (
		<div className="max-h-48 shrink-0 overflow-y-auto border-b border-border p-2 text-xs">
			<div className="mb-1 font-medium text-muted-foreground">审计日志</div>
			{isPending && <div className="text-muted-foreground">加载中…</div>}
			{!isPending && (data?.length ?? 0) === 0 && (
				<div className="text-muted-foreground">暂无记录</div>
			)}
			{data?.map((entry) => (
				<div
					key={entry.id}
					className="flex items-center gap-2 py-0.5 text-foreground"
				>
					{/* 级别色标 */}
					<span
						className="size-1.5 shrink-0 rounded-full"
						style={{
							background:
								LEVEL_COLOR[entry.classification ?? ""] ??
								"var(--muted-foreground)",
						}}
					/>
					{/* 时间 */}
					<span className="shrink-0 tabular-nums text-muted-foreground">
						{formatTime(entry.timestamp)}
					</span>
					{/* 命令（等宽，截断前 40 字符） */}
					<code className="min-w-0 flex-1 truncate font-mono">
						{truncateCommand(entry.command ?? "")}
					</code>
					{/* 结果 + 耗时 */}
					<span className="shrink-0 text-muted-foreground">
						{formatResult(entry)}
					</span>
				</div>
			))}
		</div>
	);
}
