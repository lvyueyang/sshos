/**
 * 系统监控仪表盘（docs 界面设计 §7 / W2）：消费 /api/metrics/:sessionId 快照流，
 * 展示 CPU / 内存 / 磁盘 / 网络实时指标与最近 30 点趋势折线（SVG）。
 * 流式数据仅组件内消费，不进全局 store（决策记录 D10），复用 useMetricsStream hook。
 */

import { useMetricsStream } from "#/hooks/use-metrics-stream";

interface MonitorDashboardProps {
	sessionId: string;
}

/** 折线图最大采样点数 */
const MAX_POINTS = 30;

export function MonitorDashboard({ sessionId }: MonitorDashboardProps) {
	const { points, latest, error } = useMetricsStream(sessionId, MAX_POINTS);

	return (
		<div className="flex h-full flex-col gap-3 overflow-y-auto bg-transparent p-3 text-sm">
			{error && (
				<div className="text-xs" style={{ color: "var(--danger)" }}>
					{error}
				</div>
			)}
			{!latest && !error && (
				<div className="text-xs" style={{ color: "var(--muted)" }}>
					等待指标采样…
				</div>
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
					<div
						className="rounded border p-2"
						style={{ borderColor: "var(--rule)" }}
					>
						<div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
							CPU / 内存使用率（近 {points.length} 点）
						</div>
						<TrendChart
							points={points.map((p) => ({
								cpu: p.cpu.usage,
								mem: usagePct(p.memory),
							}))}
						/>
					</div>
				</>
			)}
		</div>
	);
}

/** 单个指标卡片：名称 + 数值 + 副标题 + 容量条 */
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
		<div className="rounded border p-3" style={{ borderColor: "var(--rule)" }}>
			<div className="text-xs" style={{ color: "var(--muted)" }}>
				{label}
			</div>
			<div
				className="mt-1 text-xl font-semibold tabular-nums"
				style={{ color: "var(--ink)" }}
			>
				{value}
			</div>
			<div className="mt-1 truncate text-xs" style={{ color: "var(--muted)" }}>
				{sub}
			</div>
			{percent > 0 && (
				<div
					className="mt-2 h-1.5 overflow-hidden rounded"
					style={{ background: "var(--bg3)" }}
				>
					<div
						className="h-full"
						style={{
							width: `${Math.min(percent, 100)}%`,
							background: "var(--accent)",
						}}
					/>
				</div>
			)}
		</div>
	);
}

/** SVG 趋势折线：CPU（accent）与内存（accent2）双序列 */
function TrendChart({
	points,
}: {
	points: Array<{ cpu: number; mem: number }>;
}) {
	const W = 560;
	const H = 120;
	const PAD = 4;
	const max = 100;

	if (points.length < 2) {
		return (
			<div
				className="flex h-[120px] items-center justify-center text-xs"
				style={{ color: "var(--muted)" }}
			>
				采集中…
			</div>
		);
	}

	const toXY = (fn: (p: { cpu: number; mem: number }) => number, i: number) => {
		const x = PAD + (i * (W - PAD * 2)) / (points.length - 1);
		const y = H - PAD - (Math.min(fn(points[i]), max) / max) * (H - PAD * 2);
		return `${x},${y}`;
	};

	const cpuLine = points.map((_, i) => toXY((p) => p.cpu, i)).join(" ");
	const memLine = points.map((_, i) => toXY((p) => p.mem, i)).join(" ");

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-[120px] w-full"
			preserveAspectRatio="none"
			role="img"
			aria-label="CPU 与内存使用率趋势"
		>
			{[25, 50, 75].map((v) => (
				<line
					key={v}
					x1={PAD}
					x2={W - PAD}
					y1={(v / 100) * (H - PAD * 2) + PAD}
					y2={(v / 100) * (H - PAD * 2) + PAD}
					stroke="var(--rule)"
					strokeWidth="0.5"
				/>
			))}
			<polyline
				points={memLine}
				fill="none"
				stroke="var(--accent2)"
				strokeWidth="1.5"
			/>
			<polyline
				points={cpuLine}
				fill="none"
				stroke="var(--accent)"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

/** 内存 / 磁盘使用率百分比（total 为 0 时返回 0） */
function usagePct(v: { total: number; used: number }): number {
	return v.total > 0 ? Math.round((v.used / v.total) * 100) : 0;
}

/** 字节数转可读文本（对齐 files 工具，监控侧复用等价实现） */
function formatBytes(bytes?: number): string {
	if (!bytes || bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const idx = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** idx;
	return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

/** 速率格式化：B/s → KB/s / MB/s */
function formatRate(bytesPerSec: number): string {
	return `${formatBytes(bytesPerSec)}/s`;
}
