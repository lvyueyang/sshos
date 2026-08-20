/**
 * files 应用 SFn 包装（docs 技术架构 §5.4）：
 * 目录浏览（list）与低风险新建（mkdir）不挂策略；删除 / 重命名挂 sftpPolicyMiddleware
 * （路径分类，block 抛 PolicyError / review 走审批，见 docs 技术架构 §7.4）。
 * 纯 SFTP 逻辑在 services/sftp/sftp.server.ts。
 */

import { createServerFn } from "@tanstack/react-start";
import { auditLogMiddleware } from "#/middleware/audit-log";
import { sftpPolicyMiddleware } from "#/middleware/policy-engine";
import { ensureSftp, sftpManager } from "#/services/sftp/sftp.server";
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

/** 删除远程文件 / 目录（递归删除，审计在外层包裹策略，挂策略引擎） */
export const sftpDeleteSFn = createServerFn({ method: "POST" })
	.middleware([auditLogMiddleware, sftpPolicyMiddleware])
	.validator(sftpDeleteSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.delete(data.sessionId, data.path);
		return { ok: true };
	});

/** 重命名 / 移动（审计在外层包裹策略，挂策略引擎，SFTP rename 原语覆盖两者） */
export const sftpRenameSFn = createServerFn({ method: "POST" })
	.middleware([auditLogMiddleware, sftpPolicyMiddleware])
	.validator(sftpRenameSchema)
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.rename(data.sessionId, data.oldPath, data.newPath);
		return { ok: true };
	});
