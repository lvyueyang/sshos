/**
 * capabilities 服务 SFn（发行版 Profile / 远程工具探测 / 安装引导）：
 * getSessionProfileSFn / probeToolsSFn 供 App 能力探测与 AI 上下文消费；
 * getToolInstallInfoSFn / installToolSFn 供安装引导（一键 / 手动）使用。
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/middleware/auth-guard";
import {
	getSessionProfileSchema,
	installToolSchema,
	probeToolsSchema,
} from "./capabilities.schemas";
import {
	getSessionDistroProfile,
	getToolInstallInfo,
	installTool,
	probeRemoteTools,
} from "./capabilities.server";

/** 查询会话发行版 Profile（探测一次并缓存） */
export const getSessionProfileSFn = createServerFn({ method: "GET" })
	.validator(getSessionProfileSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => getSessionDistroProfile(data.sessionId));

/** 批量探测远程工具可用性（结果按会话缓存，TTL 60s；refresh 时强制重探） */
export const probeToolsSFn = createServerFn({ method: "POST" })
	.validator(probeToolsSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) =>
		probeRemoteTools(data.sessionId, data.tools, { refresh: data.refresh }),
	);

/** 查询工具在当前会话发行版下的安装信息（一键 / 手动安装引导） */
export const getToolInstallInfoSFn = createServerFn({ method: "GET" })
	.validator(installToolSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => getToolInstallInfo(data.sessionId, data.toolId));

/** 一键安装：包管理器写操作 → review 审批 → 批准重放执行（无绕过路径） */
export const installToolSFn = createServerFn({ method: "POST" })
	.validator(installToolSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const stdout = await installTool(data.sessionId, data.toolId);
		return { ok: true, stdout };
	});
