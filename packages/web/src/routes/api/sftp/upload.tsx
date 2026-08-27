/**
 * SFTP 流式上传 Server Route（docs 技术架构 §5.2 / W2）：
 * POST /api/sftp/upload?sessionId=..&dirPath=..&filename=..，body 为原始文件字节，
 * 流式写入远程路径（不经内存缓冲）。低风险新建，不挂策略（docs 技术架构 §5.3）。
 * 服务端依赖在 handler 内动态 import，避免进入 client bundle（import-protection）。
 */

import { defineServerRoute } from "#/types/server-route";

/** 合并远程目录与文件名（Linux 路径恒为 / 分隔） */
function joinDir(dirPath: string, filename: string): string {
	return dirPath.endsWith("/")
		? `${dirPath}${filename}`
		: `${dirPath}/${filename}`;
}

/**
 * 清洗上传参数：文件名拒绝路径分隔符与 ..（防路径穿越覆盖系统文件）。
 * 目录路径同样拒绝 .. 段。返回空串表示非法。
 */
function sanitizeUpload(dirPath: string, filename: string): string | null {
	if (!filename || filename.includes("/") || filename.includes("\\"))
		return null;
	if (filename === "." || filename === "..") return null;
	if (dirPath.split("/").includes("..")) return null;
	return joinDir(dirPath, filename);
}

export const Route = defineServerRoute("/api/sftp/upload", {
	server: {
		handlers: {
			POST: async ({ request }) => {
				const url = new URL(request.url);
				const sessionId = url.searchParams.get("sessionId") ?? "";
				const dirPath = url.searchParams.get("dirPath") ?? "";
				const filename = url.searchParams.get("filename") ?? "";
				if (!sessionId || !request.body) {
					return new Response("缺少 sessionId / dirPath / filename 或请求体", {
						status: 400,
					});
				}
				const remotePath = sanitizeUpload(dirPath, filename);
				if (!remotePath) {
					return new Response("非法文件名或路径", { status: 400 });
				}
				const [{ Readable }, { pipeline }, { ensureSftp, sftpManager }] =
					await Promise.all([
						import("node:stream"),
						import("node:stream/promises"),
						import("#/services/ssh/sftp/sftp.server"),
					]);
				await ensureSftp(sessionId);
				const writeStream = sftpManager.createWriteStream(
					sessionId,
					remotePath,
				);

				// pipeline 统一处理完成 / 错误 / 资源清理（SFTP 写流的 finish 事件不总是触发）
				const webToNode = Readable.fromWeb(
					request.body as unknown as import("node:stream/web").ReadableStream,
				);
				await pipeline(webToNode, writeStream);

				return Response.json({ ok: true, path: remotePath });
			},
		},
	},
});
