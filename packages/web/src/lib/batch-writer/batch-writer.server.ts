/**
 * 通用批量缓冲写入器（BatchWriter<T>，docs 技术架构 §4.5）：
 * 定时 / 定量批量写入 + 容量上限 + 进程退出时强制刷新，避免高频写入拖慢主流程。
 * 写入目标由调用方注入 insertFn，可服务任意领域（审计日志 / 埋点 / 指标等）。
 * 写入失败把条目放回头部并按指数退避重试（上限 maxRetryDelayMs），不丢数据。
 * flush 串行化：并发调用 / 退出刷空会 join 当前 in-flight 写入，不丢末批数据。
 */

import { logger } from "#/lib/logger/logger.server";

export interface BatchWriterOptions<T> {
	/** 日志标签（区分不同 writer 的日志，如「审计日志」） */
	logLabel: string;
	/** 批量写入函数：接收一批条目，由调用方决定落库方式（如 INSERT 数据库） */
	insertFn: (items: T[]) => Promise<void>;
	/** 缓冲上限：达到此数量即触发写入（默认 200，必须 > 0） */
	maxBufferSize?: number;
	/** 定时刷新间隔 ms（默认 1000，必须 > 0） */
	flushIntervalMs?: number;
	/** 写入失败重试退避上限 ms（默认 60000，必须 > 0） */
	maxRetryDelayMs?: number;
}

export class BatchWriter<T> {
	private buffer: T[] = [];
	private timer: NodeJS.Timeout | null = null;
	private flushing = false;
	/** 当前 in-flight 写入的 promise（供并发 flush / flushOnExit join） */
	private flushPromise: Promise<void> | null = null;
	/** 失败后的重试间隔（指数退避，成功后复位） */
	private retryDelayMs: number;
	private readonly logLabel: string;
	private readonly insertFn: (items: T[]) => Promise<void>;
	private readonly maxBufferSize: number;
	private readonly flushIntervalMs: number;
	private readonly maxRetryDelayMs: number;

	constructor(options: BatchWriterOptions<T>) {
		this.logLabel = options.logLabel;
		this.insertFn = options.insertFn;
		this.maxBufferSize = options.maxBufferSize ?? 200;
		this.flushIntervalMs = options.flushIntervalMs ?? 1_000;
		this.maxRetryDelayMs = options.maxRetryDelayMs ?? 60_000;
		// 防误用：0/负值会导致每次 enqueue 立即 flush 或 interval 0 疯狂触发
		if (this.maxBufferSize <= 0) {
			throw new Error("maxBufferSize 必须大于 0");
		}
		if (this.flushIntervalMs <= 0) {
			throw new Error("flushIntervalMs 必须大于 0");
		}
		if (this.maxRetryDelayMs <= 0) {
			throw new Error("maxRetryDelayMs 必须大于 0");
		}
		this.retryDelayMs = this.flushIntervalMs;
	}

	/** 排定下次 flush：buffer 非空且无挂起 timer 时启动（重试退避由 retryDelayMs 控制） */
	private schedule(): void {
		if (this.buffer.length === 0 || this.timer) return;
		this.timer = setTimeout(() => {
			void this.flush();
		}, this.retryDelayMs);
		this.timer.unref();
	}

	enqueue(item: T): void {
		this.buffer.push(item);
		if (this.buffer.length >= this.maxBufferSize) {
			void this.flush();
			return;
		}
		this.schedule();
	}

	/**
	 * 刷空缓冲区（写入失败把条目放回头部并按指数退避重试）。
	 * 串行化：已有写入进行中时 join 当前 in-flight promise，而不是提前返回——
	 * 保证 flushOnExit / 达上限触发的 flush 不会与在途写入交错丢批。
	 */
	async flush(): Promise<void> {
		if (this.flushing) {
			return this.flushPromise ?? Promise.resolve();
		}
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		if (this.buffer.length === 0) return;
		this.flushing = true;
		const entries = this.buffer.splice(0, this.buffer.length);
		let finish!: () => void;
		this.flushPromise = new Promise<void>((resolve) => {
			finish = resolve;
		});
		try {
			await this.insertFn(entries);
			this.retryDelayMs = this.flushIntervalMs;
		} catch (err) {
			logger.error({ err, label: this.logLabel }, "批量写入失败");
			// 失败条目放回缓冲区头部，指数退避后重试，避免数据丢失
			this.buffer.unshift(...entries);
			this.retryDelayMs = Math.min(this.retryDelayMs * 2, this.maxRetryDelayMs);
		} finally {
			this.flushing = false;
			this.flushPromise = null;
			this.schedule();
			finish();
		}
	}

	/**
	 * 进程退出前强制刷新（优雅关闭阶段调用）：
	 * 先 join 在途写入并刷空当前积压，再冲刷 flush 期间新入队的条目。
	 * 写失败会把条目放回 buffer（长度不减少）——此时停止，避免写入故障时挂起退出进程
	 * （与原有「尽力一次、失败可退出」语义一致）。
	 */
	async flushOnExit(): Promise<void> {
		await this.flush();
		while (this.buffer.length > 0) {
			const before = this.buffer.length;
			await this.flush();
			if (this.buffer.length >= before) break;
		}
	}
}
