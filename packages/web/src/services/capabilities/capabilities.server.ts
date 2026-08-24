/**
 * 能力服务（发行版 Profile / 远程工具探测 / 安装引导）：
 * 复用 core 的 distro-profile 探测与缓存，executor 基于 ssh2 exec 通道。
 * 探测命令为服务端固定只读命令，走直接 exec（不经策略分类），与 metrics 采样一致；
 * 工具名经白名单字符集校验，不接受用户任意文本。
 */

import {
	type DistroExecutor,
	type DistroProfile,
	getOrDetectDistroProfile,
} from "@sshos/core";
import { execWithPolicy } from "../ssh/exec.service";
import { execCommand } from "../ssh/ssh.server";
import { TOOL_CACHE_TTL_MS, toolCache } from "./cache";
import { buildInstallCommand, INSTALL_KNOWLEDGE } from "./install-knowledge";
import {
	assertToolName,
	buildProbeCommand,
	parseProbeOutput,
	type ToolProbeResult,
} from "./probe";

/** SSH exec 通道执行器 */
const distroExecutor: DistroExecutor = {
	exec: (sessionId, command) => execCommand(sessionId, command),
};

/** 查询会话发行版 Profile（探测一次并缓存，随会话生命周期） */
export async function getSessionDistroProfile(
	sessionId: string,
): Promise<DistroProfile> {
	return getOrDetectDistroProfile(distroExecutor, sessionId);
}

/** 批量探测远程工具可用性（按会话缓存 + TTL；refresh 时跳过缓存强制重探） */
export async function probeRemoteTools(
	sessionId: string,
	tools: string[],
	opts?: { refresh?: boolean },
): Promise<ToolProbeResult[]> {
	const now = Date.now();
	let entry = toolCache.get(sessionId);
	if (!entry || opts?.refresh || now - entry.updatedAt > TOOL_CACHE_TTL_MS) {
		entry = { updatedAt: now, results: new Map() };
		toolCache.set(sessionId, entry);
	}

	const missing = tools.filter((t) => {
		assertToolName(t);
		return !entry.results.has(t);
	});

	if (missing.length > 0) {
		const text = await execCommand(sessionId, buildProbeCommand(missing));
		const parsed = parseProbeOutput(text, missing);
		for (const t of missing) entry.results.set(t, parsed[t]);
	}

	return tools.map((t) => ({
		tool: t,
		available: entry.results.get(t) ?? false,
	}));
}

/** 工具安装信息（供一键 / 手动安装引导展示） */
export interface ToolInstallInfoResult {
	label: string;
	/** 当前发行版的一键安装命令；null = 无法自动生成 */
	command: string | null;
	/** 手动安装步骤 */
	manual?: string;
	/** 提示 */
	note?: string;
	packageManager: DistroProfile["packageManager"];
}

/** 查询工具在当前会话发行版下的安装信息 */
export async function getToolInstallInfo(
	sessionId: string,
	toolId: string,
): Promise<ToolInstallInfoResult> {
	const info = knowledgeOf(toolId);
	const profile = await getSessionDistroProfile(sessionId);
	const pkg = info.packages[profile.packageManager];
	const command = pkg ? buildInstallCommand(profile.packageManager, pkg) : null;
	return {
		label: info.label,
		command,
		...(info.manual ? { manual: info.manual } : {}),
		...(info.note ? { note: info.note } : {}),
		packageManager: profile.packageManager,
	};
}

/** 一键安装：查知识库 → 按 Profile 拼命令 → 走策略引擎（包管理器写操作 → review 审批，无绕过路径） */
export async function installTool(
	sessionId: string,
	toolId: string,
): Promise<string> {
	const info = knowledgeOf(toolId);
	const profile = await getSessionDistroProfile(sessionId);
	const pkg = info.packages[profile.packageManager];
	if (!pkg) {
		throw new Error(
			`当前发行版（${profile.id}）的包管理器无此软件包，请使用手动安装或 AI 安装`,
		);
	}
	const command = buildInstallCommand(profile.packageManager, pkg);
	if (!command) throw new Error("无法自动生成安装命令");
	return execWithPolicy(sessionId, command);
}

/** 从知识库查工具；用 Object.hasOwn 防原型链命中（toolId 来自 SFn 入参，防御性校验） */
function knowledgeOf(toolId: string) {
	if (!Object.hasOwn(INSTALL_KNOWLEDGE, toolId)) {
		throw new Error(`未知工具: ${toolId}`);
	}
	return INSTALL_KNOWLEDGE[toolId];
}
