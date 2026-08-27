/**
 * SFTP 流式下载 Server Route（docs 技术架构 §5.2 / W2）：
 * GET /api/sftp/download?sessionId=..&path=..，ReadableStream 直通远程文件，
 * 响应带 RFC 6266/5987 双态文件名（中文文件名不乱码）。
 * 服务端依赖在 handler 内动态 import，避免进入 client bundle（import-protection）。
 */

import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/sftp/download", {
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const sessionId = url.searchParams.get("sessionId") ?? "";
				const path = url.searchParams.get("path") ?? "";
				if (!sessionId || !path) {
					return new Response("缺少 sessionId 或 path", { status: 400 });
				}
				const [{ ensureSftp, sftpManager }, { createFileDownloadResponse }] =
					await Promise.all([
						import("#/services/ssh/sftp/sftp.server"),
						import("#/services/transfer/transfer.server"),
					]);
				await ensureSftp(sessionId);
				const filename = path.split("/").filter(Boolean).at(-1) ?? "download";
				return createFileDownloadResponse(
					sftpManager.createReadStream(sessionId, path),
					{ filename },
				);
			},
		},
	},
});
