/**
 * files 应用 SFn 包装（docs 技术架构 §5.4）：
 * 目录浏览（list）、低风险新建（mkdir）、删除 / 重命名均不挂策略引擎——
 * 用户手动文件操作不走策略（SSH 连接器本质，人对自己操作负责）。
 * 下载 / 上传走 SFn：下载返回流式 ReadableStream，上传通过 FormData 提交。
 * 纯 SFTP 逻辑在 services/ssh/sftp.server.ts。
 */

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/middleware/auth-guard";
import { ensureSftp, sftpManager } from "#/services/ssh/sftp/sftp.server";
import {
	sftpDeleteSchema,
	sftpDownloadSchema,
	sftpListSchema,
	sftpMkdirSchema,
	sftpRenameSchema,
	sftpStatSchema,
} from "./files.schemas";

/** 列出远程目录内容 */
export const sftpListSFn = createServerFn({ method: "GET" })
	.validator(sftpListSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		return sftpManager.list(data.sessionId, data.path);
	});

/** 获取文件 / 目录元信息 */
export const sftpStatSFn = createServerFn({ method: "GET" })
	.validator(sftpStatSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		return sftpManager.stat(data.sessionId, data.path);
	});

/** 新建远程目录（低风险新建，safe 放行） */
export const sftpMkdirSFn = createServerFn({ method: "POST" })
	.validator(sftpMkdirSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.mkdir(data.sessionId, data.path);
		return { ok: true };
	});

/** 删除远程文件 / 目录（递归删除；用户手动操作，不挂策略） */
export const sftpDeleteSFn = createServerFn({ method: "POST" })
	.validator(sftpDeleteSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.delete(data.sessionId, data.path);
		return { ok: true };
	});

/** 重命名 / 移动（SFTP rename 原语覆盖两者；用户手动操作，不挂策略） */
export const sftpRenameSFn = createServerFn({ method: "POST" })
	.validator(sftpRenameSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		await sftpManager.rename(data.sessionId, data.oldPath, data.newPath);
		return { ok: true };
	});

/** 合并远程目录与文件名（Linux 路径恒为 / 分隔） */
function joinDir(dirPath: string, filename: string): string {
	return dirPath.endsWith("/")
		? `${dirPath}${filename}`
		: `${dirPath}/${filename}`;
}

/**
 * 清洗上传参数：文件名拒绝路径分隔符与 ..（防路径穿越覆盖系统文件）。
 * 目录路径同样拒绝 .. 段。返回 null 表示非法。
 */
function sanitizeUpload(dirPath: string, filename: string): string | null {
	if (!filename || filename.includes("/") || filename.includes("\\")) {
		return null;
	}
	if (filename === "." || filename === "..") return null;
	if (dirPath.split("/").includes("..")) return null;
	return joinDir(dirPath, filename);
}

/** 上传入参：FormData（sessionId / dirPath / file），POST 专用（multipart） */
function parseUploadForm(data: unknown) {
	if (!(data instanceof FormData)) {
		throw new Error("上传请求需使用 FormData");
	}
	const sessionId = data.get("sessionId");
	const dirPath = data.get("dirPath");
	const file = data.get("file");
	if (
		typeof sessionId !== "string" ||
		typeof dirPath !== "string" ||
		!(file instanceof File)
	) {
		throw new Error("上传参数不合法");
	}
	return { sessionId, dirPath, file };
}

/** 流式下载远程文件（SFn 流式返回 ReadableStream<Uint8Array>，客户端组装 Blob） */
export const sftpDownloadSFn = createServerFn({ method: "GET" })
	.validator(sftpDownloadSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		await ensureSftp(data.sessionId);
		const stream = sftpManager.createReadStream(data.sessionId, data.path);
		return Readable.toWeb(
			stream as unknown as Readable,
		) as unknown as ReadableStream<Uint8Array>;
	});

/** 流式上传（SFn FormData，multipart 流式写远程文件；低风险新建，不挂策略） */
export const sftpUploadSFn = createServerFn({ method: "POST" })
	.validator(parseUploadForm)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const remotePath = sanitizeUpload(data.dirPath, data.file.name);
		if (!remotePath) throw new Error("非法文件名或路径");
		await ensureSftp(data.sessionId);
		const writeStream = sftpManager.createWriteStream(
			data.sessionId,
			remotePath,
		);
		// pipeline 统一处理完成 / 错误 / 资源清理（SFTP 写流 finish 事件不总是触发）
		const webToNode = Readable.fromWeb(
			data.file.stream() as unknown as import("node:stream/web").ReadableStream,
		);
		await pipeline(webToNode, writeStream);
		return { ok: true, path: remotePath };
	});
