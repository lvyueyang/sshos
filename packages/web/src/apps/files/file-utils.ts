/**
 * 文件管理器工具：目录判断（file app 内部复用；字节 / 时间格式化统一在 lib/format）
 */

import type { FileInfo } from "@sshos/core";

/** 目录 / 符号链接视为可进入项 */
export function isDirectory(item: FileInfo): boolean {
	return item.type === "directory" || item.type === "link";
}
