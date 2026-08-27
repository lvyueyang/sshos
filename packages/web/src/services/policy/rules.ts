/**
 * 命令 / 文件操作规则集（docs 技术架构 §7.5）。
 * 三段式模型：只维护 block 黑名单（直接拒绝）；safe 白名单单一来源在
 * classifier.READ_COMMANDS；其余命令默认 review（人工确认），无需逐个枚举。
 */

import type { Rule } from "./types";

/** 基础命令黑名单：命中即 block，连人工确认都不给 */
export const baseRules: Rule[] = [
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
];

/**
 * 文件操作黑名单路径（classifyFileOperation 使用）：命中即 block。
 * 供 AI / 自动操作的文件写工具分类；用户手动文件操作不经过策略引擎。
 */
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

/** 生产环境追加命令黑名单（isProduction 连接启用）；当前无额外项，保留结构供扩展 */
export const productionRules: Rule[] = [];

/** 命令规则集入口（isProduction 时并入生产子集） */
export function getRules(opts?: { isProduction?: boolean }): Rule[] {
	const rules = [...baseRules];
	if (opts?.isProduction) rules.push(...productionRules);
	return rules;
}

/** 文件路径规则集入口（生产环境暂未追加额外路径规则） */
export function getPathRules(): Rule[] {
	return [...basePathRules];
}
