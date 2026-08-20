/**
 * 审计日志批量写入器（BatchWriter，docs 技术架构 §4.5）：
 * 定时 / 定量批量 INSERT + 容量上限 + 进程退出时强制刷新，避免高频审计拖慢 PTY 吞吐
 */

import { db } from "#/db";
import { log } from "#/db/schema";
import { logger } from "#/lib/logger";

export type LogAction =
	| "executed"
	| "blocked"
	| "pending_approval"
	| "approved"
	| "rejected"
	| "user_input";
export type LogResult = "success" | "failure" | "timeout";

export interface LogEntry {
	type: "ai_audit" | "terminal_command" | "policy_decision";
	sessionId?: string | null;
	connectionId?: number | null;
	command?: string | null;
	classification?: "safe" | "review" | "block" | null;
	action: LogAction;
	result: LogResult;
	detail?: string | null;
}

const MAX_BUFFER = 200;
const FLUSH_INTERVAL_MS = 1_000;

class BatchWriter {
	private buffer: LogEntry[] = [];
	private timer: NodeJS.Timeout | null = null;
	private flushing = false;

	enqueue(entry: LogEntry): void {
		this.buffer.push(entry);
		if (this.buffer.length >= MAX_BUFFER) {
			void this.flush();
			return;
		}
		if (!this.timer) {
			this.timer = setTimeout(() => {
				void this.flush();
			}, FLUSH_INTERVAL_MS);
			this.timer.unref();
		}
	}

	/** 同步刷空缓冲区；写入失败仅记日志不抛出 */
	async flush(): Promise<void> {
		if (this.flushing) return;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.buffer.length === 0) return;
		this.flushing = true;
		const entries = this.buffer.splice(0, this.buffer.length);
		try {
			await db
				.insert(log)
				.values(entries.map((e) => ({ ...e, timestamp: new Date() })));
		} catch (err) {
			logger.error({ err }, "审计日志批量写入失败");
		} finally {
			this.flushing = false;
		}
	}

	/** 进程退出前强制刷新（优雅关闭阶段调用） */
	async flushOnExit(): Promise<void> {
		await this.flush();
	}
}

export const batchWriter = new BatchWriter();
