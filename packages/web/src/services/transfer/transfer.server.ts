/**
 * 统一流式响应构造（对齐 fsdx download.server）：
 * 将 Buffer / Node Readable 转 Web ReadableStream，Content-Disposition 同时输出
 * RFC 6266 filename 回退值与 RFC 5987 filename*，避免中文文件名乱码。
 */

import { Readable } from "node:stream";

/** RFC 6266 回退文件名：仅保留可打印 ASCII，引号转义 */
function toFallbackFilename(name: string): string {
	return name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, '\\"');
}

/** RFC 5987 编码（UTF-8'' 形式），单引号与括号需百分号编码 */
function encodeRfc5987(name: string): string {
	return encodeURIComponent(name).replace(
		/['()]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** 构造文件下载响应（流式） */
export function createFileDownloadResponse(
	source: Buffer | string | NodeJS.ReadableStream,
	opts: { filename: string; mimeType?: string },
): Response {
	const web = Readable.toWeb(
		source instanceof Readable ? source : Readable.from(source),
	) as ReadableStream;
	return new Response(web, {
		headers: {
			"Content-Type": opts.mimeType ?? "application/octet-stream",
			"Content-Disposition": `attachment; filename="${toFallbackFilename(opts.filename)}"; filename*=UTF-8''${encodeRfc5987(opts.filename)}`,
		},
	});
}
