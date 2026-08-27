/**
 * 客户端 / 服务端日志工厂（对齐 fsdx createLogger）：按天切文件 + 开发环境 stdout 美化。
 * 文件流跟随 LOG_LEVEL（默认 info；LOG_LEVEL=debug 时 SFn 调用链等 debug 日志可落文件）；
 * 跨零点自动切换新日期文件（DailyRotatingStream 写入时检测日期变化）。
 */

import type { WriteStream } from "node:fs";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { getDataDir } from "#/lib/paths/paths.server";

export interface LoggerOptions {
	level: string;
	/** 存储目录，日志写入 {storageDir}/logs/ */
	storageDir: string;
	isProd: boolean;
}

function toDateString(date = new Date()): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** 按天切文件流：每次写入检测日期，跨零点自动切换到新日期文件（进程跨天运行不中断） */
class DailyRotatingStream extends Writable {
	private stream: WriteStream | null = null;
	private fileDate = "";

	constructor(private readonly dir: string) {
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
	const { level, storageDir, isProd } = opts;
	const logDir = join(storageDir, "logs");
	if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
	const fileStream = new DailyRotatingStream(logDir);

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

/** 全局单例：数据目录由 getDataDir 约定（SSHOS_DATA_DIR 可覆盖，见 lib/paths.ts） */
export const logger = createLogger({
	level: process.env.LOG_LEVEL ?? "info",
	storageDir: getDataDir(),
	isProd: process.env.NODE_ENV === "production",
});
