/**
 * 通用审批弹窗（docs 技术架构 §7.3 / D17）：review 级写操作被策略引擎挂起后，
 * 渲染层展示拦截原因，经 approvalSFn 批准重放或拒绝丢弃。
 * 无绕过路径：批准只重放原请求（一次性 requestId），不直接执行任何新操作。
 * 视觉走 shadcn Dialog + warning 语义（docs/07 §2.3）。
 */

import { RiShieldFlashLine } from "@remixicon/react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";

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
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-warning">
						<RiShieldFlashLine className="size-4" />
						需要审批
					</DialogTitle>
					<DialogDescription className="text-foreground">
						{approval.reason}
					</DialogDescription>
				</DialogHeader>
				{approval.fnName && (
					<p className="text-xs text-muted-foreground">
						操作：{approval.fnName}
					</p>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						type="button"
						disabled={submitting}
						onClick={() => void decide("rejected")}
					>
						拒绝
					</Button>
					<Button
						type="button"
						disabled={submitting}
						onClick={() => void decide("approved")}
					>
						批准执行
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
