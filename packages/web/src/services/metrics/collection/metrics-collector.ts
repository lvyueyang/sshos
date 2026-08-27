/**
 * 系统指标采集器：周期性 exec 采样 /proc 与 df，解析后按 NDJSON 推入可读流
 */

import { PassThrough } from "node:stream";

/** 单次 CPU 采样（/proc/stat 首行累计值） */
export interface CpuSample {
	total: number;
	idle: number;
}

/** 单次网络接口采样（排除 lo 的累计字节数） */
export interface NetSample {
	rxBytes: number;
	txBytes: number;
}

/** 系统指标快照（MetricsCollector 每个采样周期推送一条） */
export interface MetricsSnapshot {
	timestamp: number;
	cpu: { usage: number; cores: number };
	memory: { total: number; used: number; free: number };
	disk: { total: number; used: number; free: number };
	network: { rxBytesPerSec: number; txBytesPerSec: number };
}

/** 样本执行器：由 web 层注入（基于 ssh2 exec 通道封装） */
export interface SampleExecutor {
	exec(sessionId: string, command: string): Promise<string>;
}

/** 一次 exec 采样的完整命令：四条命令用分隔符拼接，一次通道往返取全量指标 */
const SAMPLE_CMD = [
	"cat /proc/stat",
	"echo '__SSHOS_SEP__'",
	"cat /proc/meminfo",
	"echo '__SSHOS_SEP__'",
	"df -kP /",
	"echo '__SSHOS_SEP__'",
	"cat /proc/net/dev",
].join("; ");

/** 按分隔符切分采样输出为 stat / meminfo / df / netdev 四段 */
export function splitSample(text: string): string[] {
	const parts = text.split(/__SSHOS_SEP__\n?/);
	if (parts.length < 4) {
		throw new Error("无法解析系统指标采样输出");
	}
	return parts;
}

/** 解析 /proc/stat：返回首行累计样本与逻辑核心数 */
export function parseProcStat(text: string): {
	sample: CpuSample;
	cores: number;
} {
	let cores = 0;
	let sample: CpuSample | undefined;
	for (const line of text.split("\n")) {
		if (line.startsWith("cpu ")) {
			const fields = line.split(/\s+/).slice(1).map(Number);
			const [user, nice, system, idle, iowait, irq, softirq, steal = 0] =
				fields;
			const idleSum = (idle ?? 0) + (iowait ?? 0);
			sample = {
				total:
					(user ?? 0) +
					(nice ?? 0) +
					(system ?? 0) +
					idleSum +
					(irq ?? 0) +
					(softirq ?? 0) +
					steal,
				idle: idleSum,
			};
		} else if (/^cpu\d+/.test(line)) {
			cores++;
		}
	}
	if (!sample) throw new Error("无法解析 /proc/stat 的 cpu 行");
	return { sample, cores };
}

/** 计算 CPU 使用率百分比；prev 缺失（首采样）返回 0 */
export function computeCpuUsage(
	curr: CpuSample,
	prev: CpuSample | undefined,
): number {
	if (!prev) return 0;
	const deltaTotal = curr.total - prev.total;
	const deltaIdle = curr.idle - prev.idle;
	if (deltaTotal <= 0) return 0;
	return Math.max(0, Math.min(100, (1 - deltaIdle / deltaTotal) * 100));
}

/** 解析 /proc/meminfo：返回内存总量与可用量（字节） */
export function parseProcMeminfo(text: string): {
	total: number;
	available: number;
} {
	const total = /MemTotal:\s+(\d+)/.exec(text);
	const available = /MemAvailable:\s+(\d+)/.exec(text);
	const free = /MemFree:\s+(\d+)/.exec(text);
	if (!total) throw new Error("无法解析 /proc/meminfo 的 MemTotal");
	const availKb = available ? Number(available[1]) : Number(free?.[1] ?? 0);
	return {
		total: Number(total[1]) * 1024,
		available: availKb * 1024,
	};
}

/** 解析 df -kP 输出：返回根分区总量 / 已用 / 可用（字节） */
export function parseDfK(text: string): {
	total: number;
	used: number;
	free: number;
} {
	const dataLine = text
		.split("\n")
		.find((line) => line.trim() !== "" && !line.startsWith("Filesystem"));
	if (!dataLine) throw new Error("无法解析 df 输出");
	const fields = dataLine.trim().split(/\s+/);
	const [, blocks, used, available] = fields;
	return {
		total: Number(blocks) * 1024,
		used: Number(used) * 1024,
		free: Number(available) * 1024,
	};
}

/** 解析 /proc/net/dev：累计所有接口（排除 lo）的收发字节 */
export function parseProcNetDev(text: string): NetSample {
	let rxBytes = 0;
	let txBytes = 0;
	for (const line of text.split("\n")) {
		const match =
			/^\s*(\S+):\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/.exec(
				line,
			);
		if (!match) continue;
		if (match[1] === "lo") continue;
		rxBytes += Number(match[2]);
		txBytes += Number(match[3]);
	}
	return { rxBytes, txBytes };
}

/** 由相邻两次采样计算每秒收发速率；prev 缺失返回 0 */
export function computeNetRates(
	curr: NetSample,
	prev: NetSample | undefined,
	intervalMs: number,
): { rxBytesPerSec: number; txBytesPerSec: number } {
	if (!prev || intervalMs <= 0) return { rxBytesPerSec: 0, txBytesPerSec: 0 };
	const sec = intervalMs / 1000;
	return {
		rxBytesPerSec: Math.max(0, (curr.rxBytes - prev.rxBytes) / sec),
		txBytesPerSec: Math.max(0, (curr.txBytes - prev.txBytes) / sec),
	};
}

/**
 * 指标采集器：按固定间隔采样并推送 NDJSON 快照流。
 * 输出格式：每行一个 JSON MetricsSnapshot，客户端按行解析。
 */
export class MetricsCollector {
	private streams = new Map<string, PassThrough>();
	private timers = new Map<string, NodeJS.Timeout>();
	private prevCpu = new Map<string, CpuSample>();
	private prevNet = new Map<string, NetSample>();
	private intervalMs: number;

	constructor(
		private executor: SampleExecutor,
		opts?: { intervalMs?: number },
	) {
		this.intervalMs = opts?.intervalMs ?? 2_000;
	}

	/** 启动采样并返回快照流（立即采样一次，随后按间隔推送） */
	start(sessionId: string): NodeJS.ReadableStream {
		const stream = new PassThrough();
		this.streams.set(sessionId, stream);

		// 客户端断开（Web 流 cancel → source.destroy）时自动停止采样。
		// 注意带 stream 归属：重开监控时旧流 close 不应清掉新流的定时器
		stream.on("close", () => {
			this.stop(sessionId, stream);
		});

		const tick = async () => {
			try {
				const snapshot = await this.sample(sessionId);
				stream.write(`${JSON.stringify(snapshot)}\n`);
			} catch (err) {
				stream.destroy(err instanceof Error ? err : new Error(String(err)));
				this.stop(sessionId, stream);
			}
		};
		void tick();
		const timer = setInterval(() => {
			void tick();
		}, this.intervalMs);
		timer.unref();
		this.timers.set(sessionId, timer);
		return stream;
	}

	/** 停止采样并关闭流；传 stream 时校验归属，防止旧流 close 误停新实例 */
	stop(sessionId: string, stream?: NodeJS.ReadableStream): void {
		if (stream && this.streams.get(sessionId) !== stream) return;
		const timer = this.timers.get(sessionId);
		if (timer) clearInterval(timer);
		this.timers.delete(sessionId);
		this.prevCpu.delete(sessionId);
		this.prevNet.delete(sessionId);
		const current = this.streams.get(sessionId);
		if (current && !current.destroyed) current.end();
		this.streams.delete(sessionId);
	}

	/** 单次采样：执行命令 → 分段解析 → 组装快照 */
	private async sample(sessionId: string) {
		const text = await this.executor.exec(sessionId, SAMPLE_CMD);
		const [stat, meminfo, df, netdev] = splitSample(text);

		const { sample: cpuSample, cores } = parseProcStat(stat);
		const usage = computeCpuUsage(cpuSample, this.prevCpu.get(sessionId));
		this.prevCpu.set(sessionId, cpuSample);

		const memory = parseProcMeminfo(meminfo);
		const disk = parseDfK(df);
		const net = parseProcNetDev(netdev);
		const rates = computeNetRates(
			net,
			this.prevNet.get(sessionId),
			this.intervalMs,
		);
		this.prevNet.set(sessionId, net);

		return {
			timestamp: Date.now(),
			cpu: { usage, cores },
			memory: {
				total: memory.total,
				used: memory.total - memory.available,
				free: memory.available,
			},
			disk,
			network: rates,
		};
	}
}
