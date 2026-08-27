/**
 * 服务端日志工厂：按天切文件 + 保留天数清理 + 开发环境 stdout 美化。
 * 文件流跟随 LOG_LEVEL（默认 info；LOG_LEVEL=debug 时 SFn 调用链等 debug 日志可落文件）；
 * 跨零点自动切换新日期文件（DailyRotatingStream 写入时检测日期变化）；
 * 超过 LOG_RETENTION_DAYS（默认 7）天的旧日志文件在启动 / 跨天切换时自动清理。
 */

import type { WriteStream } from "node:fs";
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { getDataDir } from "#/lib/paths/paths.server";

/** 日志文件保留天数：超过 N 天的 .log 文件在滚动时删除 */
export const DEFAULT_RETENTION_DAYS = 7;

export interface LoggerOptions {
	level: string;
	/** 存储目录，日志写入 {storageDir}/logs/ */
	storageDir: string;
	isProd: boolean;
	/** 保留天数：超过该天数的历史日志文件被清理，默认 DEFAULT_RETENTION_DAYS */
	retentionDays?: number;
}

/** 解析 LOG_RETENTION_DAYS 环境变量，非法 / 缺省回退默认值 */
function parseRetentionDays(raw: string | undefined): number {
	if (!raw) return DEFAULT_RETENTION_DAYS;
	const n = Number.parseInt(raw, 10);
	return Number.isSafeInteger(n) && n >= 1 ? n : DEFAULT_RETENTION_DAYS;
}

function toDateString(date = new Date()): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/**
 * 清理超出保留天数的历史日志文件（文件名 YYYY-MM-DD.log）。
 * 保留 [today - retentionDays + 1, today] 区间内的文件；同步执行，目录读取失败不抛。
 */
export function cleanupExpiredLogs(
	dir: string,
	retentionDays: number,
	now = new Date(),
): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		// 目录不存在或不可读时跳过清理，不影响主流程
		return;
	}
	// 截止日期：早于等于该日期的文件删除（保留恰好 retentionDays 个日文件）
	const cutoff = toDateString(
		new Date(now.getTime() - retentionDays * 86_400_000),
	);
	for (const name of entries) {
		if (!name.endsWith(".log")) continue;
		const datePart = name.slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) continue;
		if (datePart <= cutoff) {
			rmSync(join(dir, name), { force: true });
		}
	}
}

/** 按天切文件流：每次写入检测日期，跨零点自动切换到新日期文件（进程跨天运行不中断） */
class DailyRotatingStream extends Writable {
	private stream: WriteStream | null = null;
	private fileDate = "";

	constructor(
		private readonly dir: string,
		private readonly retentionDays: number,
	) {
		super();
		this.open();
	}

	private open(): void {
		this.fileDate = toDateString();
		this.stream = createWriteStream(join(this.dir, `${this.fileDate}.log`), {
			flags: "a",
		});
		this.stream.on("error", (err) => {
			// 文件写失败不抛进程，仅 stderr 提示（避免日志故障影响主流程）
			console.error("[logger] 日志文件写入错误", err);
		});
		// 启动 / 跨天切换时顺带清理过期文件（目录滚动，避免长期运行无限累积）
		cleanupExpiredLogs(this.dir, this.retentionDays);
	}

	_write(
		chunk: Buffer | string,
		_enc: BufferEncoding,
		cb: (error?: Error | null) => void,
	): void {
		const today = toDateString();
		if (today !== this.fileDate) {
			this.stream?.end();
			this.open();
		}
		this.stream?.write(chunk, cb);
	}
}

export function createLogger(opts: LoggerOptions): pino.Logger {
	const {
		level,
		storageDir,
		isProd,
		retentionDays = DEFAULT_RETENTION_DAYS,
	} = opts;
	const logDir = join(storageDir, "logs");
	if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
	const fileStream = new DailyRotatingStream(logDir, retentionDays);

	const stdoutStream = isProd
		? process.stdout
		: pinoPretty({
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname",
				destination: process.stdout,
			});

	return pino(
		{ level },
		pino.multistream([
			// 文件流与根级别一致：LOG_LEVEL=debug 时记录 SFn 调用链等调试日志
			{ stream: fileStream, level },
			{ stream: stdoutStream, level: isProd ? "warn" : "info" },
		]),
	);
}

/** 全局单例：数据目录由 getDataDir 约定（SSHOS_DATA_DIR 可覆盖，见 lib/paths.ts）；保留天数由 LOG_RETENTION_DAYS 覆盖 */
export const logger = createLogger({
	level: process.env.LOG_LEVEL ?? "info",
	storageDir: getDataDir(),
	isProd: process.env.NODE_ENV === "production",
	retentionDays: parseRetentionDays(process.env.LOG_RETENTION_DAYS),
});
