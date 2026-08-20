/**
 * 文件管理器工具：字节格式化 / 时间格式化 / 目录判断（file app 内部复用）
 */

import type { FileInfo } from "@sshos/core";

/** 字节数转可读文本（B/KB/MB/GB） */
export function formatBytes(bytes?: number): string {
	if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "-";
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const idx = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** idx;
	return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

/** 毫秒时间戳转可读时间（- 表示未知） */
export function formatTime(mtime?: number): string {
	if (!mtime) return "-";
	const d = new Date(mtime);
	return d.toLocaleString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** 目录 / 符号链接视为可进入项 */
export function isDirectory(item: FileInfo): boolean {
	return item.type === "directory" || item.type === "link";
}
