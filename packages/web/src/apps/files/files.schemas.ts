/**
 * files 应用 SFn 入参出参 Zod schema（单一来源，服务层用 z.infer 派生）
 */

import { z } from "zod";

/** 列出远程目录内容 */
export const sftpListSchema = z.object({
	sessionId: z.string().min(1),
	path: z.string().min(1).default("/"),
});

/** 获取文件 / 目录元信息（重命名时校验目标冲突） */
export const sftpStatSchema = z.object({
	sessionId: z.string().min(1),
	path: z.string().min(1),
});

/** 新建远程目录（低风险新建，safe 放行） */
export const sftpMkdirSchema = z.object({
	sessionId: z.string().min(1),
	path: z.string().min(1),
});

/** 删除远程文件 / 目录（写操作，挂策略引擎路径分类） */
export const sftpDeleteSchema = z.object({
	sessionId: z.string().min(1),
	path: z.string().min(1),
});

/** 重命名 / 移动（SFTP rename 原语，写操作，挂策略引擎） */
export const sftpRenameSchema = z.object({
	sessionId: z.string().min(1),
	oldPath: z.string().min(1),
	newPath: z.string().min(1),
});

/** 流式下载远程文件（SFn 返回 ReadableStream<Uint8Array>，客户端组装 Blob） */
export const sftpDownloadSchema = z.object({
	sessionId: z.string().min(1),
	path: z.string().min(1),
});
