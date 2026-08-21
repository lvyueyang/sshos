/**
 * 桌面状态卡片（docs 界面设计 §3.4 / A3）：monitor 应用的 panel surface 内容，
 * 自启渲染于桌面右上角，宽 180px，半透明 + 模糊。消费同一 metrics 快照流，
 * 展示 CPU / 内存 / 磁盘三行实时占用与进度条。
 */

import { useMetricsStream } from "#/hooks/use-metrics-stream";

interface MonitorPanelProps {
	sessionId: string;
}

/** 内存 / 磁盘使用率百分比（total 为 0 时返回 0） */
function usagePct(v: { total: number; used: number }): number {
	return v.total > 0 ? Math.round((v.used / v.total) * 100) : 0;
}

/** 字节数转可读文本（监控面板迷你版） */
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

export function MonitorPanel({ sessionId }: MonitorPanelProps) {
	// 单点订阅：仅取最新快照，不保留历史
	const { latest, error } = useMetricsStream(sessionId, 1);

	return (
		<div
			className="rounded-lg border px-3 py-2 shadow-lg backdrop-blur-md"
			style={{
				background: "rgba(22,27,34,0.72)",
				borderColor: "var(--rule)",
				width: 180,
			}}
		>
			{error && (
				<div className="text-xs" style={{ color: "var(--danger)" }}>
					{error}
				</div>
			)}
			{!latest && !error && (
				<div className="text-xs" style={{ color: "var(--muted)" }}>
					等待指标…
				</div>
			)}
			{latest && (
				<div className="space-y-2 text-xs">
					<PanelRow
						label="CPU"
						value={`${latest.cpu.usage.toFixed(0)}%`}
						percent={latest.cpu.usage}
					/>
					<PanelRow
						label="MEM"
						value={formatBytes(latest.memory.used)}
						percent={usagePct(latest.memory)}
					/>
					<PanelRow
						label="DSK"
						value={formatBytes(latest.disk.used)}
						percent={usagePct(latest.disk)}
					/>
				</div>
			)}
		</div>
	);
}

/** 面板单行：标签 + 数值 + 容量进度条 */
function PanelRow({
	label,
	value,
	percent,
}: {
	label: string;
	value: string;
	percent: number;
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="w-8 shrink-0" style={{ color: "var(--muted)" }}>
				{label}
			</span>
			<div
				className="h-1.5 min-w-0 flex-1 overflow-hidden rounded"
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
			<span
				className="w-12 shrink-0 text-right tabular-nums"
				style={{ color: "var(--ink)" }}
			>
				{value}
			</span>
		</div>
	);
}
