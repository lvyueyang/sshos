/**
 * 日志窗口（docs 技术架构 §4.3 结构化日志「UI 展示、查询过滤、审计面板」落地）：
 * 统一查看 ai_audit / terminal_command / policy_decision 三类结构化日志。
 * 支持范围（当前会话 / 全部连接）、类型、级别过滤与手动分页加载（useInfiniteQuery）。
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	ACTION_LABEL,
	formatDuration,
	formatFullTime,
	LEVEL_COLOR,
	TYPE_COLOR,
	TYPE_LABEL,
} from "#/lib/logs-format";
import { listLogsSFn } from "#/services/logs/logs.functions";

interface LogsWindowProps {
	sessionId: string;
}

/** 查询范围：当前会话 / 全部连接 */
type LogScope = "session" | "all";
/** 类型过滤（all = 不限制） */
type TypeFilter = "all" | "ai_audit" | "terminal_command" | "policy_decision";
/** 级别过滤（all = 不限制） */
type LevelFilter = "all" | "safe" | "review" | "block";

/** 每页条数（listLogsSFn limit 上限 200） */
const PAGE_SIZE = 100;

export function LogsWindow({ sessionId }: LogsWindowProps) {
	const [scope, setScope] = useState<LogScope>("session");
	const [type, setType] = useState<TypeFilter>("all");
	const [level, setLevel] = useState<LevelFilter>("all");
	const [refreshKey, setRefreshKey] = useState(0);

	const types = type === "all" ? undefined : [type];
	const classification = level === "all" ? undefined : level;
	// 当前会话范围：sessionId 未就绪（连接中）时退回全部连接视图
	const session = scope === "session" ? sessionId || undefined : undefined;

	const { data, fetchNextPage, hasNextPage, isFetching, isPending } =
		useInfiniteQuery({
			queryKey: ["logs", session, types, classification, refreshKey],
			queryFn: ({ pageParam }) =>
				listLogsSFn({
					data: {
						sessionId: session,
						types,
						classification,
						limit: PAGE_SIZE,
						offset: pageParam,
					},
				}),
			initialPageParam: 0,
			getNextPageParam: (lastPage, pages) =>
				lastPage.length >= PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
		});

	const rows = data?.pages.flat() ?? [];

	return (
		<div className="flex h-full flex-col text-sm">
			{/* 过滤栏 */}
			<div
				className="flex shrink-0 flex-wrap items-center gap-2 border-b p-2 text-xs"
				style={{ borderColor: "var(--rule)" }}
			>
				<FilterGroup
					label="范围"
					value={scope}
					options={[
						{ value: "session", label: "当前会话" },
						{ value: "all", label: "全部连接" },
					]}
					onChange={(v) => setScope(v as LogScope)}
				/>
				<FilterGroup
					label="类型"
					value={type}
					options={[
						{ value: "all", label: "全部" },
						{ value: "ai_audit", label: "AI 审计" },
						{ value: "terminal_command", label: "终端命令" },
						{ value: "policy_decision", label: "策略决策" },
					]}
					onChange={(v) => setType(v as TypeFilter)}
				/>
				<FilterGroup
					label="级别"
					value={level}
					options={[
						{ value: "all", label: "全部" },
						{ value: "safe", label: "safe" },
						{ value: "review", label: "review" },
						{ value: "block", label: "block" },
					]}
					onChange={(v) => setLevel(v as LevelFilter)}
				/>
				<button
					type="button"
					onClick={() => setRefreshKey((k) => k + 1)}
					className="rounded border px-2 py-1"
					style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
				>
					刷新
				</button>
			</div>

			{/* 当前会话范围但连接未就绪时的降级提示 */}
			{scope === "session" && !sessionId && (
				<div
					className="shrink-0 border-b px-3 py-1 text-xs"
					style={{ borderColor: "var(--rule)", color: "var(--warn)" }}
				>
					当前连接未就绪，暂显示全部连接日志
				</div>
			)}

			{/* 日志列表 */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isPending && (
					<div className="p-3 text-xs" style={{ color: "var(--muted)" }}>
						加载中…
					</div>
				)}
				{!isPending && rows.length === 0 && (
					<div className="p-3 text-xs" style={{ color: "var(--muted)" }}>
						暂无日志
					</div>
				)}
				{rows.map((entry) => {
					const action = ACTION_LABEL[entry.action ?? ""] ?? entry.action ?? "";
					const duration = formatDuration(entry.detail);
					return (
						<div
							key={entry.id}
							className="flex items-center gap-2 border-b px-3 py-1.5"
							style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
						>
							{/* 级别色标 */}
							<span
								className="size-1.5 shrink-0 rounded-full"
								style={{
									background:
										LEVEL_COLOR[entry.classification ?? ""] ?? "var(--muted)",
								}}
							/>
							{/* 类型徽标 */}
							<span
								className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
								style={{
									background: `color-mix(in srgb, ${
										TYPE_COLOR[entry.type] ?? "var(--muted)"
									} 18%, transparent)`,
									color: TYPE_COLOR[entry.type] ?? "var(--muted)",
								}}
							>
								{TYPE_LABEL[entry.type] ?? entry.type}
							</span>
							{/* 时间 */}
							<span
								className="shrink-0 tabular-nums"
								style={{ color: "var(--muted)" }}
								title={formatFullTime(entry.timestamp)}
							>
								{formatFullTime(entry.timestamp)}
							</span>
							{/* 命令（等宽，截断） */}
							<code className="min-w-0 flex-1 truncate font-mono">
								{entry.command ?? "(无命令)"}
							</code>
							{/* 动作 · 耗时 */}
							<span className="shrink-0" style={{ color: "var(--muted)" }}>
								{duration ? `${action} · ${duration}` : action}
							</span>
						</div>
					);
				})}
			</div>

			{/* 加载更多 / 加载中 */}
			<div
				className="shrink-0 border-t p-2 text-center text-xs"
				style={{ borderColor: "var(--rule)" }}
			>
				{isFetching && <span style={{ color: "var(--muted)" }}>加载中…</span>}
				{!isFetching && hasNextPage && (
					<button
						type="button"
						onClick={() => void fetchNextPage()}
						className="rounded border px-3 py-1"
						style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
					>
						加载更多
					</button>
				)}
				{!isFetching && !hasNextPage && rows.length > 0 && (
					<span style={{ color: "var(--muted)" }}>已加载全部</span>
				)}
			</div>
		</div>
	);
}

/** 过滤下拉组（label + select） */
function FilterGroup({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
}) {
	return (
		<label className="flex items-center gap-1">
			<span style={{ color: "var(--muted)" }}>{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="rounded border bg-transparent px-1.5 py-1 outline-none"
				style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}
