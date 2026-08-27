/**
 * 状态灯（docs/07 §2.3）：连接四态统一视觉——
 * online=success / connecting=warning（脉冲）/ error=danger / offline=muted。
 */

import { cn } from "#/utils";

export type ConnectionStatus = "online" | "offline" | "connecting" | "error";

const STATUS_CLASS: Record<ConnectionStatus, string> = {
	online: "bg-success",
	offline: "bg-muted-foreground/50",
	connecting: "bg-warning",
	error: "bg-danger",
};

interface StatusDotProps {
	status: ConnectionStatus;
	className?: string;
}

/** 连接状态圆点（8px），连接中带脉冲动画 */
export function StatusDot({ status, className }: StatusDotProps) {
	return (
		<span
			className={cn(
				"inline-block size-2 shrink-0 rounded-full",
				STATUS_CLASS[status],
				status === "connecting" && "animate-pulse",
				className,
			)}
			aria-hidden="true"
		/>
	);
}
