/**
 * 审批决策 SFn（docs 技术架构 §7.3）：approved 重放执行原命令，rejected 丢弃。
 * 本身不挂 Policy Engine（避免递归审批），只信任一次性、绑定原请求的 requestId。
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { batchWriter } from "#/lib/batch-writer/batch-writer.server";
import { approvalRegistry } from "./registry";

const approvalSchema = z.object({
	requestId: z.string(),
	decision: z.enum(["approved", "rejected"]),
});

const listPendingSchema = z.object({
	sessionId: z.string().min(1),
});

/** 审批决策 SFn：approved 重放执行原操作，rejected 丢弃 */
export const approvalSFn = createServerFn({ method: "POST" })
	.validator(approvalSchema)
	.handler(async ({ data }) => {
		const entry = approvalRegistry.consume(data.requestId);
		if (!entry) {
			throw new Error("审批请求不存在或已过期");
		}

		if (data.decision === "rejected") {
			batchWriter.enqueue({
				type: "policy_decision",
				sessionId: entry.sessionId,
				connectionId: entry.connectionId,
				command: extractCommand(entry.data),
				classification: "review",
				action: "rejected",
				result: "failure",
				detail: JSON.stringify({ reason: entry.reason }),
			});
			return { decision: "rejected" as const };
		}

		// approved：重放执行原 handler（不再过策略——已人工确认），结果写审计
		const result = await entry.replay();
		batchWriter.enqueue({
			type: "policy_decision",
			sessionId: entry.sessionId,
			connectionId: entry.connectionId,
			command: extractCommand(entry.data),
			classification: "review",
			action: "approved",
			result: "success",
			detail: JSON.stringify({ hasResult: result !== undefined }),
		});
		return { decision: "approved" as const };
	});

/** 列出某会话的挂起审批（写操作被 review 拦截后，渲染层据此弹出审批） */
export const listPendingApprovalsSFn = createServerFn({ method: "GET" })
	.validator(listPendingSchema)
	.handler(async ({ data }) => {
		return approvalRegistry.listBySession(data.sessionId);
	});

function extractCommand(data: unknown): string {
	if (typeof data === "string") return data;
	if (data && typeof data === "object" && "command" in data) {
		return String((data as { command: unknown }).command);
	}
	return JSON.stringify(data);
}
