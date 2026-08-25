/**
 * Pi Agent 封装（docs 技术架构 §8.4）：把 Pi SDK 的工具调用映射到由调用方注入的
 * 服务端 handler（ai.functions.ts 注入 SFn 包装）。依赖方向：pi-agent 不直接 import
 * SFn（避免与 ai.functions.ts 循环依赖）。
 *
 * API 已按 0.84.2 实测定稿（W0 spike）：createAgentSession + defineTool(TypeBox) +
 * session.subscribe / session.prompt，无 Pi 类 / registerTool / stream()。
 * 模型 / 凭据 / 设置取自项目自有 pi 运行时（ai-config，与用户 ~/.pi 隔离）。
 */

import {
	createAgentSession,
	defineTool,
	type ModelRuntime,
	type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveConfiguredModel } from "#/services/ai-config/ai-config.server";

/** 工具 handler 集：由 ai.functions.ts 注入（内部走 SFn，写命令自动过 Policy Engine） */
export interface AgentTools {
	execCommand(command: string): Promise<{ isError: boolean; content: string }>;
	readFile(path: string): Promise<{ isError: boolean; content: string }>;
	listDir(path: string): Promise<{ isError: boolean; content: string }>;
}

/** 建立 Pi Agent 会话并注册自定义工具，返回 session 与事件流入口 */
export async function createPiAgent(tools: AgentTools) {
	const shellTool = defineTool({
		name: "shell",
		label: "Shell",
		description:
			"在远程会话执行一条 shell 命令（非交互式）。命令会经过安全策略引擎校验，被拦截或需审批时返回错误说明。",
		parameters: Type.Object({
			command: Type.String(),
		}),
		execute: async (_toolCallId, params: { command: string }) => {
			return toToolResult(await tools.execCommand(params.command));
		},
	});

	const fileReadTool = defineTool({
		name: "file_read",
		label: "读文件",
		description: "读取远程文件内容（文本，最多 64KB）。",
		parameters: Type.Object({
			path: Type.String(),
		}),
		execute: async (_toolCallId, params: { path: string }) => {
			return toToolResult(await tools.readFile(params.path));
		},
	});

	const listDirTool = defineTool({
		name: "list_dir",
		label: "列目录",
		description: "列出远程目录内容（名称、类型、大小、修改时间）。",
		parameters: Type.Object({
			path: Type.String(),
		}),
		execute: async (_toolCallId, params: { path: string }) => {
			return toToolResult(await tools.listDir(params.path));
		},
	});

	// noTools "all" 会连自定义工具一起禁用；"builtin" 禁用内置（read/bash/edit/write）
	// 但保留 customTools。命令执行必须走自定义 shell 工具（经 Policy Engine）
	const { session, modelFallbackMessage } = await createAgentSession({
		noTools: "builtin",
		customTools: [shellTool, fileReadTool, listDirTool],
		...(await resolveSessionConfig()),
	});

	return {
		session,
		modelFallbackMessage,
		prompt: session.prompt.bind(session),
		subscribe: session.subscribe.bind(session),
	};
}

/**
 * 解析项目自有 pi 运行时配置：agentDir / modelRuntime / settingsManager / 默认模型 /
 * cwd 全部指到项目数据目录，与用户本机 ~/.pi 隔离（模型配置 UI 的消费端）。
 */
async function resolveSessionConfig(): Promise<{
	agentDir: string;
	cwd: string;
	modelRuntime: ModelRuntime;
	settingsManager: SettingsManager;
	model: ReturnType<ModelRuntime["getModel"]>;
}> {
	const { modelRuntime, settingsManager, model, agentDir, cwd } =
		await resolveConfiguredModel();
	return { modelRuntime, settingsManager, model, agentDir, cwd };
}

/** 工具 handler 结果转 AgentToolResult：文本进 content，失败标志进 details */
function toToolResult(result: { isError: boolean; content: string }) {
	return {
		content: [{ type: "text" as const, text: result.content }],
		details: { isError: result.isError },
	};
}
