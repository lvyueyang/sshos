/**
 * BatchWriter<T> 单元测试：并发 flush 串行化、flushOnExit 冲刷、失败不挂起、参数校验。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchWriter } from "../batch-writer.server";

vi.mock("#/lib/logger/logger.server", () => ({
	logger: { error: vi.fn(), info: vi.fn() },
}));

/** 让微任务 / 定时器推进一帧（触发 insertFn 进入 await 点） */
function tick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 可手动放行的写入门闩：insertFn 进入后挂起，直到 release() */
function gate() {
	let release!: () => void;
	const promise = new Promise<void>((r) => (release = r));
	return { promise, release };
}

function makeWriter(insertFn: (items: string[]) => Promise<void>) {
	return new BatchWriter({
		logLabel: "test",
		insertFn,
		flushIntervalMs: 20,
		maxBufferSize: 3,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("BatchWriter 构造参数校验", () => {
	it("maxBufferSize / flushIntervalMs / maxRetryDelayMs 为 0 或负值时抛错", () => {
		const base = { logLabel: "t", insertFn: vi.fn() };
		expect(() => new BatchWriter({ ...base, maxBufferSize: 0 })).toThrow();
		expect(() => new BatchWriter({ ...base, maxBufferSize: -1 })).toThrow();
		expect(() => new BatchWriter({ ...base, flushIntervalMs: 0 })).toThrow();
		expect(() => new BatchWriter({ ...base, maxRetryDelayMs: 0 })).toThrow();
	});
});

describe("BatchWriter 串行化 flush", () => {
	it("并发 flush join 同一在途写入，insertFn 只执行一次", async () => {
		const calls: string[][] = [];
		const g = gate();
		const insertFn = vi.fn(async (items: string[]) => {
			calls.push([...items]);
			await g.promise;
		});
		const writer = makeWriter(insertFn);

		writer.enqueue("a");
		const first = writer.flush();
		await tick(); // first flush 已进入 await 点（在途）
		const second = writer.flush(); // 应 join first，而非再起一批

		g.release();
		await Promise.all([first, second]);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual(["a"]);
	});
});

describe("flushOnExit", () => {
	it("等待在途写入完成，并冲刷 flush 期间新入队的条目", async () => {
		const calls: string[][] = [];
		const g = gate();
		const insertFn = vi.fn(async (items: string[]) => {
			calls.push([...items]);
			await g.promise;
		});
		const writer = makeWriter(insertFn);

		writer.enqueue("a");
		const exitTask = writer.flushOnExit();
		await tick(); // 第一批 a 在途
		writer.enqueue("b"); // flush 期间新入队
		g.release(); // 放行第一批
		await exitTask;

		expect(calls.flat()).toEqual(["a", "b"]);
	});

	it("insertFn 持续失败时无进展即停（不挂起退出进程）", async () => {
		const insertFn = vi.fn(async () => {
			throw new Error("db down");
		});
		const writer = makeWriter(insertFn);

		writer.enqueue("a");
		// 失败会把条目放回 buffer（长度不减少），flushOnExit 应在第二轮无进展处返回
		await writer.flushOnExit();

		expect(insertFn.mock.calls.length).toBeLessThanOrEqual(2);
	});
});
