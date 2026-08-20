/**
 * 审计日志中间件（docs 技术架构 §7.8）：挂载在 Policy Engine 外层，
 * try/finally 确保 block / review 错误也落审计；命令字段与分类器一致优先提取 data.command。
 */

import type { Verdict } from "@sshos/policy";
import { createMiddleware } from "@tanstack/react-start";
import { ApprovalRequiredError, PolicyError } from "../approval/registry";
import {
	batchWriter,
	type LogAction,
	type LogResult,
} from "../lib/batch-writer";

/** 与分类器一致：优先提取 command 字段，避免整包对象序列化入库 */
function extractCommand(data: unknown): string {
	if (typeof data === "string") return data;
	if (data && typeof data === "object" && "command" in data) {
		return String((data as { command: unknown }).command);
	}
	return JSON.stringify(data);
}

function extractSessionId(data: unknown): string | undefined {
	if (data && typeof data === "object" && "sessionId" in data) {
		return String((data as { sessionId?: unknown }).sessionId ?? "");
	}
	return undefined;
}

export const auditLogMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next, data, context }) => {
		const startedAt = Date.now();
		let action: LogAction = "executed";
		let result: LogResult = "success";
		try {
			return await next();
		} catch (err) {
			if (err instanceof ApprovalRequiredError) {
				action = "pending_approval";
			} else if (err instanceof PolicyError) {
				action = "blocked";
			}
			result = "failure";
			throw err;
		} finally {
			const verdict = (context as unknown as { verdict?: Verdict }).verdict;
			batchWriter.enqueue({
				type: "policy_decision",
				sessionId: extractSessionId(data),
				command: extractCommand(data),
				classification: verdict?.level,
				action,
				result,
				detail: JSON.stringify({ durationMs: Date.now() - startedAt }),
			});
		}
	},
);
