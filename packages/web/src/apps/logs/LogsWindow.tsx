/**
 * 日志窗口（docs 技术架构 §4.3 结构化日志「UI 展示、查询过滤、审计面板」落地）：
 * 统一查看 ai_audit / terminal_command / policy_decision 三类结构化日志。
 * 支持范围（当前会话 / 全部连接）、类型、级别过滤与手动分页加载（useInfiniteQuery）。
 * 视觉走 shadcn Select/Table/Badge（docs/07 §3）。
 */

import { RiRefreshLine } from "@remixicon/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	ACTION_LABEL,
	formatDuration,
	formatFullTime,
	LEVEL_COLOR,
	TYPE_COLOR,
	TYPE_LABEL,
} from "#/lib/logs-format/logs-format";
import { listLogsSFn } from "#/services/logs/audit/audit.functions";

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
			<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2 text-xs">
				<FilterSelect
					label="范围"
					value={scope}
					onChange={(v) => setScope(v as LogScope)}
					options={[
						{ value: "session", label: "当前会话" },
						{ value: "all", label: "全部连接" },
					]}
				/>
				<FilterSelect
					label="类型"
					value={type}
					onChange={(v) => setType(v as TypeFilter)}
					options={[
						{ value: "all", label: "全部" },
						{ value: "ai_audit", label: "AI 审计" },
						{ value: "terminal_command", label: "终端命令" },
						{ value: "policy_decision", label: "策略决策" },
					]}
				/>
				<FilterSelect
					label="级别"
					value={level}
					onChange={(v) => setLevel(v as LevelFilter)}
					options={[
						{ value: "all", label: "全部" },
						{ value: "safe", label: "safe" },
						{ value: "review", label: "review" },
						{ value: "block", label: "block" },
					]}
				/>
				<Button
					variant="ghost"
					size="xs"
					type="button"
					onClick={() => setRefreshKey((k) => k + 1)}
				>
					<RiRefreshLine /> 刷新
				</Button>
			</div>

			{/* 当前会话范围但连接未就绪时的降级提示 */}
			{scope === "session" && !sessionId && (
				<div className="shrink-0 border-b border-border bg-warning-soft px-3 py-1 text-xs text-warning">
					当前连接未就绪，暂显示全部连接日志
				</div>
			)}

			{/* 日志列表 */}
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isPending && (
					<div className="space-y-1 p-2">
						{[0, 1, 2, 3, 4].map((i) => (
							<div key={i} className="flex items-center gap-2 px-2 py-1.5">
								<Skeleton className="size-1.5 shrink-0 rounded-full" />
								<Skeleton className="h-3.5 w-16" />
								<Skeleton className="h-3.5 w-28" />
								<Skeleton className="h-3.5 flex-1" />
							</div>
						))}
					</div>
				)}
				{!isPending && rows.length === 0 && (
					<div className="p-3 text-xs text-muted-foreground">暂无日志</div>
				)}
				{!isPending && rows.length > 0 && (
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-10" />
								<TableHead className="w-20">类型</TableHead>
								<TableHead className="w-36">时间</TableHead>
								<TableHead>命令</TableHead>
								<TableHead className="w-28 text-right">动作 · 耗时</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((entry) => {
								const action =
									ACTION_LABEL[entry.action ?? ""] ?? entry.action ?? "";
								const duration = formatDuration(entry.detail);
								const typeColor =
									TYPE_COLOR[entry.type] ?? "var(--muted-foreground)";
								return (
									<TableRow key={entry.id}>
										<TableCell>
											<span
												className="inline-block size-1.5 shrink-0 rounded-full"
												style={{
													background:
														LEVEL_COLOR[entry.classification ?? ""] ??
														"var(--muted-foreground)",
												}}
											/>
										</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												className="text-[10px] font-medium"
												style={{
													color: typeColor,
													background: `color-mix(in srgb, ${typeColor} 14%, transparent)`,
												}}
											>
												{TYPE_LABEL[entry.type] ?? entry.type}
											</Badge>
										</TableCell>
										<TableCell
											className="shrink-0 tabular-nums text-muted-foreground"
											title={formatFullTime(entry.timestamp)}
										>
											{formatFullTime(entry.timestamp)}
										</TableCell>
										<TableCell className="max-w-0">
											<code className="block truncate font-mono">
												{entry.command ?? "(无命令)"}
											</code>
										</TableCell>
										<TableCell className="shrink-0 text-right text-muted-foreground">
											{duration ? `${action} · ${duration}` : action}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</div>

			{/* 加载更多 / 加载中 */}
			<div className="shrink-0 border-t border-border p-2 text-center text-xs text-muted-foreground">
				{isFetching && <span>加载中…</span>}
				{!isFetching && hasNextPage && (
					<Button
						variant="outline"
						size="xs"
						type="button"
						onClick={() => void fetchNextPage()}
					>
						加载更多
					</Button>
				)}
				{!isFetching && !hasNextPage && rows.length > 0 && (
					<span>已加载全部</span>
				)}
			</div>
		</div>
	);
}

/** 过滤下拉（shadcn Select 封装，label + 选项） */
function FilterSelect({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
}) {
	return (
		<div className="flex items-center gap-1">
			<span className="text-muted-foreground">{label}</span>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="h-7 w-auto min-w-24 gap-1 px-2 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
