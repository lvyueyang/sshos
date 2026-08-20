/**
 * 消费 Server Route PTY 流的 hook（docs 技术架构 §5.2）：
 * fetch /api/pty/:sessionId，逐 chunk 解码后回调，组件卸载时中断。
 */

import { useEffect, useRef } from "react";

export function usePtyStream(
	sessionId: string | undefined,
	onData: (text: string) => void,
): void {
	const onDataRef = useRef(onData);
	onDataRef.current = onData;

	useEffect(() => {
		if (!sessionId) return;
		const controller = new AbortController();
		let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

		void (async () => {
			try {
				const res = await fetch(`/api/pty/${sessionId}`, {
					signal: controller.signal,
				});
				if (!res.ok || !res.body) return;
				reader = res.body.getReader();
				const decoder = new TextDecoder();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					onDataRef.current(decoder.decode(value, { stream: true }));
				}
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					onDataRef.current(`\r\n[连接流异常] ${(err as Error).message}\r\n`);
				}
			}
		})();

		return () => {
			controller.abort();
			void reader?.cancel().catch(() => {});
		};
	}, [sessionId]);
}
