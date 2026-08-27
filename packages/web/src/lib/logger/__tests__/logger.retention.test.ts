/**
 * logger 保留天数清理单元测试：边界日期、非日志文件 / 非日期命名文件不误删
 */

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	cleanupExpiredLogs,
	DEFAULT_RETENTION_DAYS,
} from "#/lib/logger/logger.server";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "sshos-logger-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** 写入一个当日日期命名的日志文件 */
function touch(name: string): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), "line\n");
}

/** 以固定"今天"为基准生成 N 天前的日期字符串 */
function dateDaysAgo(days: number): string {
	const d = new Date(Date.UTC(2026, 2, 10)); // 2026-03-10
	d.setUTCDate(d.getUTCDate() - days);
	const pad = (n: number) => `${n}`.padStart(2, "0");
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

describe("cleanupExpiredLogs", () => {
	it("删除超期文件、保留最近 retentionDays 天与今天的文件", () => {
		// 今天 + 昨天…6 天前（共 7 个，保留），7 天前与 30 天前（删除）
		for (let i = 0; i <= 6; i++) touch(`${dateDaysAgo(i)}.log`);
		touch(`${dateDaysAgo(7)}.log`);
		touch(`${dateDaysAgo(30)}.log`);

		cleanupExpiredLogs(
			dir,
			DEFAULT_RETENTION_DAYS,
			new Date(2026, 2, 10, 12, 0, 0),
		);

		expect(existsSync(join(dir, "2026-03-10.log"))).toBe(true);
		expect(existsSync(join(dir, `${dateDaysAgo(6)}.log`))).toBe(true);
		expect(existsSync(join(dir, `${dateDaysAgo(7)}.log`))).toBe(false);
		expect(existsSync(join(dir, `${dateDaysAgo(30)}.log`))).toBe(false);
	});

	it("保留期边界：恰好 retentionDays 天前的文件被清理", () => {
		// 保留期 1 天：仅今天保留，昨天（恰好 1 天前）即删除
		for (let i = 0; i <= 2; i++) touch(`${dateDaysAgo(i)}.log`);
		cleanupExpiredLogs(dir, 1, new Date(2026, 2, 10, 23, 59, 59));
		expect(existsSync(join(dir, "2026-03-10.log"))).toBe(true);
		expect(existsSync(join(dir, "2026-03-09.log"))).toBe(false);
	});

	it("忽略非 .log 与日期命名格式不符的文件", () => {
		touch("notes.txt");
		touch("backup.log"); // 无日期前缀
		touch("2026-03-09.log.bak"); // 后缀不匹配
		touch("2026-13-40.log"); // 非法日期（不匹配 YYYY-MM-DD 语义，仅格式校验）

		cleanupExpiredLogs(
			dir,
			DEFAULT_RETENTION_DAYS,
			new Date(2026, 2, 10, 0, 0, 0),
		);

		expect(existsSync(join(dir, "notes.txt"))).toBe(true);
		expect(existsSync(join(dir, "backup.log"))).toBe(true);
		expect(existsSync(join(dir, "2026-03-09.log.bak"))).toBe(true);
		expect(existsSync(join(dir, "2026-13-40.log"))).toBe(true);
	});

	it("目录不存在时静默跳过不抛错", () => {
		expect(() =>
			cleanupExpiredLogs(join(dir, "no-such-dir"), DEFAULT_RETENTION_DAYS),
		).not.toThrow();
	});
});
