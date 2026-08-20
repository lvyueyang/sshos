/**
 * 客户端 / 服务端日志工厂（对齐 fsdx createLogger）：按天切文件 + 开发环境 stdout 美化
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { getDataDir } from "#/lib/paths";

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

export function createLogger(opts: LoggerOptions): pino.Logger {
	const { level, storageDir, isProd } = opts;
	const logDir = join(storageDir, "logs");
	if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
	const logFile = join(logDir, `${toDateString()}.log`);
	const fileStream = createWriteStream(logFile, { flags: "a" });

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
			{ stream: fileStream, level: "info" },
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
