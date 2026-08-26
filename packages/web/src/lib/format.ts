/**
 * 通用格式化工具（docs/07：收敛跨 app 重复实现）：字节 / 速率 / 使用率 / 时间。
 * 替换 MonitorDashboard / MonitorPanel / files 各自维护的同名实现。
 */

/** 字节数转可读文本（B/KB/MB/GB/TB；非法值返回 "-"） */
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

/** 速率格式化：B/s → KB/s / MB/s */
export function formatRate(bytesPerSec: number): string {
	return `${formatBytes(bytesPerSec)}/s`;
}

/** 内存 / 磁盘使用率百分比（total 为 0 时返回 0） */
export function usagePct(v: { total: number; used: number }): number {
	return v.total > 0 ? Math.round((v.used / v.total) * 100) : 0;
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
