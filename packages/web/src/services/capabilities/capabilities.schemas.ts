/**
 * capabilities 服务 SFn 入参出参 Zod schema（单一来源，服务层用 z.infer 派生）
 */

import { z } from "zod";

/** 查询会话发行版 Profile */
export const getSessionProfileSchema = z.object({
	sessionId: z.string().min(1),
});

/** 批量探测远程工具可用性（工具名来自 App manifest 声明，白名单字符集校验） */
export const probeToolsSchema = z.object({
	sessionId: z.string().min(1),
	tools: z.array(z.string().min(1)).min(1).max(32),
	/** true=跳过会话缓存强制重新探测（安装完成后刷新可用性用） */
	refresh: z.boolean().optional(),
});

/** 查询工具安装信息 / 一键安装（toolId 必须命中安装知识库） */
export const installToolSchema = z.object({
	sessionId: z.string().min(1),
	toolId: z.string().min(1),
});
