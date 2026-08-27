/**
 * 桌面状态卡片（docs 界面设计 §3.4 / A3）：monitor 应用的 panel surface 内容，
 * 自启渲染于桌面右上角，宽 180px，半透明 + 模糊。消费同一 metrics 快照流，
 * 展示 CPU / 内存 / 磁盘三行实时占用与进度条（语义 token + shadcn Progress）。
 */

import { Progress } from "#/components/ui/progress";
import { useMetricsStream } from "#/hooks/use-metrics-stream";
import { formatBytes, usagePct } from "#/lib/format/format";
import { cn } from "#/utils";

interface MonitorPanelProps {
	sessionId: string;
}

export function MonitorPanel({ sessionId }: MonitorPanelProps) {
	// 单点订阅：仅取最新快照，不保留历史
	const { latest, error } = useMetricsStream(sessionId, 1);

	return (
		<div className="w-[180px] rounded-lg border border-border bg-card/70 px-3 py-2 shadow-md backdrop-blur-md">
			{error && <div className="text-xs text-danger">{error}</div>}
			{!latest && !error && (
				<div className="text-xs text-muted-foreground">等待指标…</div>
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

/** 面板单行：标签 + 容量进度条 + 数值 */
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
			<span
				className={cn(
					"w-8 shrink-0",
					percent >= 95 ? "text-danger" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
			<Progress value={percent} className="h-1.5 min-w-0 flex-1" />
			<span className="w-12 shrink-0 text-right tabular-nums text-foreground">
				{value}
			</span>
		</div>
	);
}
