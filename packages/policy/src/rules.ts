/**
 * 命令 / 文件操作规则集（docs 技术架构 §7.5）。
 * safe 级白名单单一来源在 classifier.READ_COMMANDS，此处不重复声明。
 */

import type { Rule } from "./types";

/** 基础命令规则：block 危险 / review 写操作 */
export const baseRules: Rule[] = [
	// block 级
	// 删除根（含通配）——覆盖 rm -r/ -f/ -rf/ -fr 加 / 或 /* 的四种形态
	{
		pattern: /rm\s+-[rf]+\s+(\/|\/\*)(\s|$)/,
		level: "block",
		description: "rm -rf root",
	},
	{
		pattern: /rm\s+-r\s+-f\s+(\/|\/\*)(\s|$)/,
		level: "block",
		description: "rm -r -f root",
	},
	// 强制递归删除系统敏感路径
	{
		pattern: /rm\s+-[rf]+\s+\/(etc|boot|usr\/(lib|bin|sbin))(\/|\s|$)/,
		level: "block",
		description: "rm -rf system path",
	},
	{ pattern: /mkfs/, level: "block", description: "format filesystem" },
	{
		pattern: /dd\s+.*of=\/dev\//,
		level: "block",
		description: "write to device",
	},
	{
		pattern: /:\(\)\s*\{.*\|.*&\s*\};/,
		level: "block",
		description: "fork bomb",
	},

	// review 级
	{ pattern: /rm\s+/, level: "review", description: "file deletion" },
	{ pattern: /chmod\s+/, level: "review", description: "permission change" },
	{
		pattern: /systemctl\s+(stop|disable)/,
		level: "review",
		description: "service stop",
	},
	{
		pattern: /apt|yum|dnf|pacman/,
		level: "review",
		description: "package manager",
	},
];

/** 文件操作敏感路径规则（classifyFileOperation 使用）：敏感路径删除 / 移动 → block */
export const basePathRules: Rule[] = [
	{ pattern: /^\/$/, level: "block", description: "delete root" },
	{
		pattern: /^\/etc($|\/)/,
		level: "block",
		description: "system config path",
	},
	{ pattern: /^\/boot($|\/)/, level: "block", description: "boot path" },
	{
		pattern: /^\/usr\/(lib|bin|sbin)($|\/)/,
		level: "block",
		description: "system binary path",
	},
];

/** 生产环境追加命令规则（isProduction 连接启用） */
export const productionRules: Rule[] = [
	{
		pattern: /systemctl\s+restart/,
		level: "review",
		description: "service restart (prod)",
	},
	{
		pattern: /curl\s+.*\|.*(sh|bash)/,
		level: "review",
		description: "piped script (prod)",
	},
];

/** 生产环境追加文件路径规则 */
export const productionPathRules: Rule[] = [
	{
		pattern: /^\/var\/lib($|\/)/,
		level: "review",
		description: "service data path (prod)",
	},
];

/** 命令规则集入口（isProduction 时并入生产子集） */
export function getRules(opts?: { isProduction?: boolean }): Rule[] {
	const rules = [...baseRules];
	if (opts?.isProduction) rules.push(...productionRules);
	return rules;
}

/** 文件路径规则集入口 */
export function getPathRules(opts?: { isProduction?: boolean }): Rule[] {
	const rules = [...basePathRules];
	if (opts?.isProduction) rules.push(...productionPathRules);
	return rules;
}
