/**
 * 消费 Server Route 指标流（api/metrics.$sessionId）的 hook（决策记录 D10）：
 * 流式数据仅组件内消费，不进全局 store；NDJSON 逐行解析，组件卸载自动中断。
 */

import type { MetricsSnapshot } from "@sshos/core";
import { useEffect, useState } from "react";
import { apiFetch } from "#/lib/api-fetch";

interface UseMetricsStreamResult {
	points: MetricsSnapshot[];
	latest: MetricsSnapshot | undefined;
	error: string | null;
}

/** 订阅指标快照流，保留最近 maxPoints 个采样点（默认 30，单点场景传 1） */
export function useMetricsStream(
	sessionId: string | undefined,
	maxPoints = 30,
): UseMetricsStreamResult {
	const [points, setPoints] = useState<MetricsSnapshot[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!sessionId) return;
		const abort = new AbortController();
		let buffer = "";
		let disposed = false;

		const pump = async () => {
			try {
				const res = await apiFetch(`/api/metrics/${sessionId}`, {
					signal: abort.signal,
				});
				if (!res.ok || !res.body) {
					setError(`监控流不可用 (${res.status})`);
					return;
				}
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (!line.trim()) continue;
						try {
							const snap = JSON.parse(line) as MetricsSnapshot;
							if (!disposed) {
								// maxPoints = 1 时 slice(-0) 等价 slice(0) 会整数组保留，统一兜底裁剪
								setPoints((prev) => [...prev, snap].slice(-maxPoints));
							}
						} catch {
							// 跳过半截 JSON（流式边界）
						}
					}
				}
			} catch (err) {
				if ((err as Error).name !== "AbortError" && !disposed) {
					setError("监控流已断开");
				}
			}
		};
		void pump();

		return () => {
			disposed = true;
			abort.abort();
		};
	}, [sessionId, maxPoints]);

	return { points, latest: points.at(-1), error };
}
