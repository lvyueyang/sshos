/**
 * 系统监控仪表盘（docs 界面设计 §7 / W2）：消费 metricsStreamSFn 快照流（SFn 流式），
 * 展示 CPU / 内存 / 磁盘 / 网络实时指标与最近 30 点趋势折线（TanStack Charts）。
 * 流式数据仅组件内消费，不进全局 store（决策记录 D10），复用 useMetricsStream hook。
 */

import { defineChart, lineY } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { useMemo } from "react";
import { Card, CardContent } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { useMetricsStream } from "#/hooks/use-metrics-stream";
import { formatBytes, formatRate, usagePct } from "#/lib/format";
import { useThemeStore } from "#/stores/theme";

interface MonitorDashboardProps {
	sessionId: string;
}

/** 折线图最大采样点数 */
const MAX_POINTS = 30;

export function MonitorDashboard({ sessionId }: MonitorDashboardProps) {
	const { points, latest, error } = useMetricsStream(sessionId, MAX_POINTS);

	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto bg-transparent p-3 text-sm">
			{error && <div className="text-xs text-danger">{error}</div>}
			{!latest && !error && (
				<div className="text-xs text-muted-foreground">等待指标采样…</div>
			)}

			{latest && (
				<>
					{/* 指标卡片 */}
					<div className="grid grid-cols-2 gap-3">
						<MetricCard
							label="CPU"
							value={`${latest.cpu.usage.toFixed(1)}%`}
							sub={`${latest.cpu.cores} 核`}
							percent={latest.cpu.usage}
						/>
						<MetricCard
							label="内存"
							value={formatBytes(latest.memory.used)}
							sub={`${formatBytes(latest.memory.total)} · ${usagePct(latest.memory)}%`}
							percent={usagePct(latest.memory)}
						/>
						<MetricCard
							label="磁盘"
							value={formatBytes(latest.disk.used)}
							sub={`${formatBytes(latest.disk.total)} · ${usagePct(latest.disk)}%`}
							percent={usagePct(latest.disk)}
						/>
						<MetricCard
							label="网络"
							value={formatRate(latest.network.rxBytesPerSec)}
							sub={`↓  ↑ ${formatRate(latest.network.txBytesPerSec)}`}
							percent={0}
						/>
					</div>

					{/* CPU / 内存趋势 */}
					<Card>
						<CardContent className="p-2">
							<div className="mb-1 text-xs text-muted-foreground">
								CPU / 内存使用率（近 {points.length} 点）
							</div>
							<TrendChart
								points={points.map((p) => ({
									cpu: p.cpu.usage,
									mem: usagePct(p.memory),
								}))}
							/>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

/** 单个指标卡片：名称 + 数值 + 副标题 + 容量进度条（shadcn Card/Progress） */
function MetricCard({
	label,
	value,
	sub,
	percent,
}: {
	label: string;
	value: string;
	sub: string;
	percent: number;
}) {
	return (
		<Card>
			<CardContent className="p-3">
				<div className="text-xs text-muted-foreground">{label}</div>
				<div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
					{value}
				</div>
				<div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
				{percent > 0 && <Progress value={percent} className="mt-2 h-1.5" />}
			</CardContent>
		</Card>
	);
}

/** 趋势折线（TanStack Charts）：CPU（chart-1）与内存（chart-2）双序列，随主题取色 */
function TrendChart({
	points,
}: {
	points: Array<{ cpu: number; mem: number }>;
}) {
	// 主题切换时重新取色（CSS 变量在浏览器解析；SSR 下 points 为空不进入）
	const scheme = useThemeStore((s) => s.scheme);
	const rows = useMemo(
		() => points.map((p, i) => ({ i, cpu: p.cpu, mem: p.mem })),
		[points],
	);
	const definition = useMemo(() => {
		if (rows.length < 2) return null;
		const root = getComputedStyle(document.documentElement);
		// 主题切换时重新取色；CSS 变量解析兜底用 scheme 对应色（docs/07 §2 双主题）
		const cpu =
			root.getPropertyValue("--chart-1").trim() ||
			(scheme === "dark" ? "#3fb950" : "#1a7f37");
		const mem =
			root.getPropertyValue("--chart-2").trim() ||
			(scheme === "dark" ? "#58a6ff" : "#0969da");
		return defineChart({
			marks: [
				lineY(rows, { x: "i", y: "cpu", stroke: cpu }),
				lineY(rows, { x: "i", y: "mem", stroke: mem }),
			],
			x: { scale: scaleLinear },
			y: { scale: scaleLinear, nice: true, grid: true },
			svgAnimation: true,
		});
	}, [rows, scheme]);

	if (!definition) {
		return (
			<div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
				采集中…
			</div>
		);
	}
	return (
		<Chart
			definition={definition}
			height={120}
			ariaLabel="CPU 与内存使用率趋势"
		/>
	);
}
