/**
 * AI 命令卡片（docs 界面设计 §8.3/8.4 / docs/07 §6）：Policy 三态视觉——
 * safe 绿（左描边 + 状态标签）/ review 黄（需要审批）/ block 红（已拦截）。
 * 数据来自 aiChatSFn 流的 tool-call 帧（服务端策略分类结果）。
 */

import { RiTerminalBoxLine } from "@remixicon/react";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

/** 命令卡片数据（服务端 tool-call 帧透出） */
export interface CommandCardData {
	command: string;
	classification: "safe" | "review" | "block";
	result: "success" | "failure";
	/** 命令输出（截断，供卡片展开） */
	output?: string;
}

const STATE: Record<
	CommandCardData["classification"],
	{ border: string; badge: string; label: string }
> = {
	safe: {
		border: "border-l-success",
		badge: "border-success-border bg-success-soft text-success",
		label: "安全 · 已执行",
	},
	review: {
		border: "border-l-warning",
		badge: "border-warning-border bg-warning-soft text-warning",
		label: "需要审批",
	},
	block: {
		border: "border-l-danger",
		badge: "border-danger-border bg-danger-soft text-danger",
		label: "已拦截",
	},
};

/** 渲染一条 AI 执行的命令（三态左描边 + 状态标签 + 截断输出） */
export function CommandCard({ card }: { card: CommandCardData }) {
	const s = STATE[card.classification] ?? STATE.block;
	return (
		<div
			className={cn(
				"mt-2 overflow-hidden rounded-md border border-border border-l-2 bg-muted/40",
				s.border,
			)}
		>
			<div className="flex items-center gap-2 px-2 py-1.5">
				<RiTerminalBoxLine className="size-3.5 shrink-0 text-muted-foreground" />
				<code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
					{card.command}
				</code>
				<Badge
					variant="outline"
					className={cn("shrink-0 text-[10px]", s.badge)}
				>
					{s.label}
				</Badge>
			</div>
			{card.output && (
				<pre className="max-h-24 overflow-auto whitespace-pre-wrap border-t border-border px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
					{card.output.length > 400
						? `${card.output.slice(0, 400)}…`
						: card.output}
				</pre>
			)}
		</div>
	);
}
