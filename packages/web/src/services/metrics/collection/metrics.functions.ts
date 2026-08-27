/**
 * 系统指标流 SFn：返回 NDJSON 快照 ReadableStream（每 2s 一条），客户端逐行解析。
 * 服务端依赖动态 import，避免进入 client bundle（import-protection）。
 */

import { createServerFn } from "@tanstack/react-start";
import { metricsStreamSchema } from "./metrics.schemas";

export const metricsStreamSFn = createServerFn({ method: "GET" })
	.validator(metricsStreamSchema)
	.handler(async ({ data }) => {
		const [{ Readable }, { metricsCollector }] = await Promise.all([
			import("node:stream"),
			import("#/services/metrics/collection/metrics.server"),
		]);
		const stream = metricsCollector.start(data.sessionId);
		return Readable.toWeb(
			stream as unknown as import("node:stream").Readable,
		) as ReadableStream<Uint8Array>;
	});
