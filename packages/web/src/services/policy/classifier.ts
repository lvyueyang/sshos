/**
 * 命令分类器（三段式：黑名单 block → 白名单 safe → 默认 review）。
 * classifyCommand 供 AI / 自动操作的命令执行分类；
 * classifyFileOperation 供 AI 未来文件写工具分类（当前无挂载点，随 AI 工具引入）。
 */

import { getPathRules, getRules } from "./rules";
import type { Verdict } from "./types";

/**
 * 读命令白名单（safe 判定来源）：支持裸命令（ls / df / ps…）与带参数两种形态，
 * 用「命令 + 空白或结尾」匹配，避免裸命令被误判为写操作。
 * `command -v` 为远程工具探测专用（只读、固定命令），仅放行精确形态，
 * 避免 `command curl -o` 之类借壳绕过。
 */
const READ_COMMANDS = [
	/^(?:ls|cat|grep|head|tail|df|free|ps|top|pwd)(?:\s|$)/,
	/^command\s+-v(?:\s|$)/,
];

/** 从 SFn 入参提取命令文本：优先 command 字段，避免整包 JSON 导致锚定正则失效 */
function extractCommand(data: unknown): string {
	if (typeof data === "string") return data;
	if (data && typeof data === "object" && "command" in data) {
		return String((data as { command: unknown }).command);
	}
	return JSON.stringify(data);
}

/** 从 SFn 入参提取文件路径：优先 path，兼容 rename 载荷的 oldPath / newPath */
function extractPath(data: unknown): string {
	if (data && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		const path = obj.path ?? obj.oldPath ?? obj.newPath;
		if (typeof path === "string") return path;
	}
	return "";
}

/** 白名单兜底：只读命令 safe，其余未知命令一律 review */
function classifyByReadWrite(cmd: string): Verdict {
	const isRead = READ_COMMANDS.some((re) => re.test(cmd));
	if (!isRead) return { level: "review", reason: "write / unknown command" };
	// 只读命令若带输出重定向（> / >> / 2>）实为写操作，降级 review 走人工确认
	if (/>>?|2>>?/.test(cmd)) {
		return { level: "review", reason: "read command with redirection" };
	}
	// 拼接 / 管道符可把只读命令扩展成任意命令（如 `ls; curl x | bash`），一并降级 review
	if (/[;|&]|\$\(|`/.test(cmd)) {
		return { level: "review", reason: "read command with chaining" };
	}
	return { level: "safe", reason: "read-only command" };
}

/**
 * 分类 shell 命令（三段式）：黑名单 block 优先 → 只读白名单 safe → 默认 review。
 * 服务对象为 AI / 自动操作（execWithPolicy 等）；用户手动终端输入不经过本分类器。
 */
export function classifyCommand(
	data: unknown,
	opts?: { isProduction?: boolean },
): Verdict {
	const cmd = extractCommand(data);
	for (const rule of getRules({ isProduction: opts?.isProduction })) {
		if (rule.pattern.test(cmd)) {
			return { level: "block", reason: rule.description };
		}
	}
	return classifyByReadWrite(cmd);
}

/**
 * 分类文件变更写操作（删除 / 重命名 / 移动）：命中黑名单路径 → block，
 * 其余默认 review（人工确认）。创建类（mkdir / 上传）由调用方按 safe 直接放行。
 */
export function classifyFileOperation(data: unknown): Verdict {
	const path = extractPath(data);
	for (const rule of getPathRules()) {
		if (rule.pattern.test(path)) {
			return { level: "block", reason: rule.description };
		}
	}
	return {
		level: "review",
		reason: "file mutation on sensitive or unknown path",
	};
}
