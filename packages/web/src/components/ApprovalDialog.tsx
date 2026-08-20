/**
 * 通用审批弹窗（docs 技术架构 §7.3 / D17）：review 级写操作被策略引擎挂起后，
 * 渲染层展示拦截原因，经 approvalSFn 批准重放或拒绝丢弃。
 * 无绕过路径：批准只重放原请求（一次性 requestId），不直接执行任何新操作。
 */

import { useState } from "react";

export interface PendingApproval {
	requestId: string;
	reason: string;
	fnName?: string;
}

interface ApprovalDialogProps {
	approval: PendingApproval;
	onDecision: (decision: "approved" | "rejected") => Promise<void>;
	onClose: () => void;
}

export function ApprovalDialog({
	approval,
	onDecision,
	onClose,
}: ApprovalDialogProps) {
	const [submitting, setSubmitting] = useState(false);

	const decide = async (decision: "approved" | "rejected") => {
		setSubmitting(true);
		try {
			await onDecision(decision);
			onClose();
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: "rgba(0,0,0,0.6)" }}
		>
			<div
				className="w-96 rounded-lg border p-4"
				style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
			>
				<h3
					className="mb-2 text-sm font-semibold"
					style={{ color: "var(--warn)" }}
				>
					需要审批
				</h3>
				<p className="mb-3 text-sm" style={{ color: "var(--ink)" }}>
					{approval.reason}
				</p>
				{approval.fnName && (
					<p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
						操作：{approval.fnName}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						disabled={submitting}
						onClick={() => void decide("rejected")}
						className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
						style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
					>
						拒绝
					</button>
					<button
						type="button"
						disabled={submitting}
						onClick={() => void decide("approved")}
						className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
						style={{ background: "var(--accent)" }}
					>
						批准执行
					</button>
				</div>
			</div>
		</div>
	);
}
