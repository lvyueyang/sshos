/**
 * 指标解析纯函数与采集器单元测试（不依赖真实 SSH）
 */

import { describe, expect, it, vi } from "vitest";
import {
	computeCpuUsage,
	computeNetRates,
	MetricsCollector,
	parseDfK,
	parseProcMeminfo,
	parseProcNetDev,
	parseProcStat,
	type SampleExecutor,
	splitSample,
} from "../collection/metrics-collector";

const PROC_STAT_1 = [
	"cpu  1901903 64039 465319 136064498 38369 3285 49956 0 0 0",
	"cpu0 475689 16064 116365 34005364 9557 817 12455 0 0 0",
	"cpu1 475872 15993 116306 34015641 9557 818 12502 0 0 0",
	"cpu2 475623 15999 116318 34019997 9611 825 12499 0 0 0",
	"cpu3 475719 15983 116330 34023496 9644 825 12500 0 0 0",
	"",
].join("\n");

const PROC_STAT_2 = [
	"cpu  1902903 65039 466319 136164498 38369 3285 49956 0 0 0",
	"cpu0 475689 16064 116365 34005364 9557 817 12455 0 0 0",
	"cpu1 475872 15993 116306 34015641 9557 818 12502 0 0 0",
	"cpu2 475623 15999 116318 34019997 9611 825 12499 0 0 0",
	"cpu3 475719 15983 116330 34023496 9644 825 12500 0 0 0",
	"",
].join("\n");

const PROC_MEMINFO = [
	"MemTotal:       16060384 kB",
	"MemFree:        10248560 kB",
	"MemAvailable:   14055216 kB",
	"Buffers:         1024896 kB",
	"",
].join("\n");

const DF_OUTPUT = [
	"Filesystem     1024-blocks     Used Available Capacity Mounted on",
	"/dev/sda1       102556368 23395284  73909144      25% /",
	"",
].join("\n");

const PROC_NETDEV_1 = [
	"Inter-|   Receive                                                |  Transmit",
	" face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
	"    lo: 1234567  1000    0    0    0     0          0         0  7654321  1000    0    0    0     0       0          0",
	"  eth0: 100000000  9000    0    0    0     0          0         0  50000000  8000    0    0    0     0       0          0",
	"",
].join("\n");

const PROC_NETDEV_2 = [
	"Inter-|   Receive                                                |  Transmit",
	" face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
	"    lo: 1234567  1000    0    0    0     0          0         0  7654321  1000    0    0    0     0       0          0",
	"  eth0: 100400000  9000    0    0    0     0          0         0  50040000  8000    0    0    0     0       0          0",
	"",
].join("\n");

describe("parseProcStat / computeCpuUsage", () => {
	it("解析 cpu 首行样本并统计逻辑核心数", () => {
		const { sample, cores } = parseProcStat(PROC_STAT_1);
		expect(cores).toBe(4);
		expect(sample.idle).toBeGreaterThan(0);
		expect(sample.total).toBeGreaterThan(sample.idle);
	});

	it("相邻两次采样计算使用率在 0-100 区间", () => {
		const first = parseProcStat(PROC_STAT_1);
		const second = parseProcStat(PROC_STAT_2);
		const usage = computeCpuUsage(second.sample, first.sample);
		expect(usage).toBeGreaterThan(0);
		expect(usage).toBeLessThanOrEqual(100);
	});

	it("首次采样无 prev 时返回 0", () => {
		const { sample } = parseProcStat(PROC_STAT_1);
		expect(computeCpuUsage(sample, undefined)).toBe(0);
	});

	it("无法解析时抛错", () => {
		expect(() => parseProcStat("no data")).toThrow();
	});
});

describe("parseProcMeminfo", () => {
	it("解析总量与可用量（字节）", () => {
		const { total, available } = parseProcMeminfo(PROC_MEMINFO);
		expect(total).toBe(16060384 * 1024);
		expect(available).toBe(14055216 * 1024);
	});

	it("无 MemAvailable 时回退 MemFree", () => {
		const text = "MemTotal:  1000000 kB\nMemFree:    800000 kB\n";
		const { available } = parseProcMeminfo(text);
		expect(available).toBe(800000 * 1024);
	});
});

describe("parseDfK", () => {
	it("解析根分区总量 / 已用 / 可用", () => {
		const { total, used, free } = parseDfK(DF_OUTPUT);
		expect(total).toBe(102556368 * 1024);
		expect(used).toBe(23395284 * 1024);
		expect(free).toBe(73909144 * 1024);
	});
});

describe("parseProcNetDev / computeNetRates", () => {
	it("排除 lo，累计 eth0 收发字节", () => {
		const { rxBytes, txBytes } = parseProcNetDev(PROC_NETDEV_1);
		expect(rxBytes).toBe(100_000_000);
		expect(txBytes).toBe(50_000_000);
	});

	it("按 2s 间隔计算速率", () => {
		const first = parseProcNetDev(PROC_NETDEV_1);
		const second = parseProcNetDev(PROC_NETDEV_2);
		const rates = computeNetRates(second, first, 2_000);
		expect(rates.rxBytesPerSec).toBe(200_000);
		expect(rates.txBytesPerSec).toBe(20_000);
	});
});

describe("splitSample", () => {
	it("切分为四段", () => {
		const parts = splitSample(
			`${PROC_STAT_1}__SSHOS_SEP__\n${PROC_MEMINFO}__SSHOS_SEP__\n${DF_OUTPUT}__SSHOS_SEP__\n${PROC_NETDEV_1}`,
		);
		expect(parts).toHaveLength(4);
	});

	it("段数不足时抛错", () => {
		expect(() => splitSample("a__SSHOS_SEP__b")).toThrow();
	});
});

describe("MetricsCollector", () => {
	it("推流 NDJSON 快照并正确解析", async () => {
		const sampleText = [
			PROC_STAT_1,
			PROC_MEMINFO,
			DF_OUTPUT,
			PROC_NETDEV_1,
		].join("__SSHOS_SEP__\n");
		const executor: SampleExecutor = {
			exec: vi.fn().mockResolvedValue(sampleText),
		};
		const collector = new MetricsCollector(executor, { intervalMs: 100 });

		const stream = collector.start("s1");
		const chunks: string[] = [];
		const onData = (chunk: Buffer) => chunks.push(chunk.toString());
		stream.on("data", onData);

		await new Promise((resolve) => setTimeout(resolve, 250));
		collector.stop("s1");

		expect(chunks.length).toBeGreaterThanOrEqual(2);
		const snapshot = JSON.parse(chunks[0]);
		expect(snapshot.cpu.cores).toBe(4);
		expect(snapshot.memory.total).toBe(16060384 * 1024);
		expect(snapshot.disk.total).toBe(102556368 * 1024);
		expect(snapshot.network).toHaveProperty("rxBytesPerSec");
	});
});
