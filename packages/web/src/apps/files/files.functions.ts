/**
 * files 应用 SFn 包装（docs 技术架构 §5.4）：
 * 目录浏览（list）、低风险新建（mkdir）、删除 / 重命名均不挂策略引擎——
 * 用户手动文件操作不走策略（SSH 连接器本质，人对自己操作负责）。
 * 纯 SFTP 逻辑在 services/sftp/sftp.server.ts。
 */

import { createServerFn } from "@tanstack/react-start";
import { ensureSftp, sftpManager } from "#/services/ssh/sftp/sftp.server";
import {
	sftpDeleteSchema,
	sftpListSchema,
	sftpMkdirSchema,
	sftpRenameSchema,
	sftpStatSchema,
} from "./files.schemas";

/** 列出远程目录内容 */
export const sftpListSFn = createServerFn({ method: "GET" })
	.validator(sftpListSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		return sftpManager.list(data.sessionId, data.path);
	});

/** 获取文件 / 目录元信息 */
export const sftpStatSFn = createServerFn({ method: "GET" })
	.validator(sftpStatSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		return sftpManager.stat(data.sessionId, data.path);
	});

/** 新建远程目录（低风险新建，safe 放行） */
export const sftpMkdirSFn = createServerFn({ method: "POST" })
	.validator(sftpMkdirSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.mkdir(data.sessionId, data.path);
		return { ok: true };
	});

/** 删除远程文件 / 目录（递归删除；用户手动操作，不挂策略） */
export const sftpDeleteSFn = createServerFn({ method: "POST" })
	.validator(sftpDeleteSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.delete(data.sessionId, data.path);
		return { ok: true };
	});

/** 重命名 / 移动（SFTP rename 原语覆盖两者；用户手动操作，不挂策略） */
export const sftpRenameSFn = createServerFn({ method: "POST" })
	.validator(sftpRenameSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.rename(data.sessionId, data.oldPath, data.newPath);
		return { ok: true };
	});
