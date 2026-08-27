/**
 * 审批机制（Approval Registry，docs 技术架构 §7.3）：
 * review 级命令在 server 侧挂起，由渲染层经 approvalSFn 决策后重放执行。
 * 挂起表带 TTL 与容量上限，requestId 一次性有效。
 */

import { randomUUID } from "node:crypto";
import type { Verdict } from "#/services/policy/types";

/** 策略拦截错误（block 级） */
export class PolicyError extends Error {
	constructor(public verdict: Verdict) {
		super(verdict.reason);
		this.name = "PolicyError";
	}
}

/** review 级审批待确认错误 */
export class ApprovalRequiredError extends Error {
	constructor(
		public requestId: string,
		reason: string,
	) {
		super(`需要审批: ${reason}`);
		this.name = "ApprovalRequiredError";
	}
}

/** 挂起中的审批请求 */
export interface PendingRequest {
	requestId: string;
	/** 原 SFn 名称 */
	fnName: string;
	/** 原入参（供审计与重放） */
	data: unknown;
	sessionId?: string;
	connectionId?: number;
	/** 拦截原因 */
	reason: string;
	createdAt: number;
	/** 重放执行原 handler（approved 时调用，不再过策略——已人工确认） */
	replay: () => Promise<unknown>;
}

const TTL_MS = 5 * 60 * 1000;
const MAX_SIZE = 100;

class ApprovalRegistry {
	private requests = new Map<string, PendingRequest>();

	/** 登记挂起请求并返回 requestId；自动清理过期项与容量上限 */
	register(entry: Omit<PendingRequest, "requestId" | "createdAt">): string {
		this.evictExpired();
		if (this.requests.size >= MAX_SIZE) {
			const oldest = [...this.requests.entries()].sort(
				(a, b) => a[1].createdAt - b[1].createdAt,
			)[0];
			if (oldest) this.requests.delete(oldest[0]);
		}
		const requestId = randomUUID();
		this.requests.set(requestId, {
			...entry,
			requestId,
			createdAt: Date.now(),
		});
		return requestId;
	}

	/** 取回并移除（一次性消费），过期请求返回 undefined */
	consume(requestId: string): PendingRequest | undefined {
		const entry = this.requests.get(requestId);
		if (!entry) return undefined;
		if (Date.now() - entry.createdAt > TTL_MS) {
			this.requests.delete(requestId);
			return undefined;
		}
		this.requests.delete(requestId);
		return entry;
	}

	/** 清空某会话的全部挂起项（Tab / 会话关闭时调用） */
	clearBySession(sessionId: string): void {
		for (const [id, entry] of this.requests) {
			if (entry.sessionId === sessionId) this.requests.delete(id);
		}
	}

	/** 列出某会话的挂起审批（按时间倒序，最新在前；供渲染层审批弹窗消费） */
	listBySession(
		sessionId: string,
	): Array<
		Pick<PendingRequest, "requestId" | "reason" | "fnName" | "createdAt">
	> {
		this.evictExpired();
		return [...this.requests.values()]
			.filter((e) => e.sessionId === sessionId)
			.sort((a, b) => b.createdAt - a.createdAt)
			.map(({ requestId, reason, fnName, createdAt }) => ({
				requestId,
				reason,
				fnName,
				createdAt,
			}));
	}

	private evictExpired(): void {
		const now = Date.now();
		for (const [id, entry] of this.requests) {
			if (now - entry.createdAt > TTL_MS) this.requests.delete(id);
		}
	}
}

export const approvalRegistry = new ApprovalRegistry();
