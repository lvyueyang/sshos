/**
 * 终端窗口（docs 界面设计 §5）：基于 xterm.js，通过 ptyStreamSFn（SFn 流式）消费
 * PTY 输出，sendInputSFn 发送键盘输入。挂载时创建 PTY channel，卸载时关闭。
 * xterm 为 CJS 且纯 client，组件内动态 import，SSR 不加载（避免模块 interop 问题）。
 */

import type { Terminal as TerminalType } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { recordTerminalCommandSFn } from "#/services/logs/logs.functions";
import { createCommandTracker } from "./command-tracker";
import {
	closePtySFn,
	createPtySFn,
	ptyStreamSFn,
	resizePtySFn,
	sendInputSFn,
} from "./terminal.functions";

interface TerminalWindowProps {
	sessionId: string;
}

export function TerminalWindow({ sessionId }: TerminalWindowProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<TerminalType | null>(null);
	const ptyIdRef = useRef<string | null>(null);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let disposed = false;
		let abort: AbortController | null = null;
		let ptyReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		let fitAddon: { fit(): void } | null = null;
		let inputDisposable: { dispose(): void } | null = null;
		let resizeObserver: ResizeObserver | null = null;

		void (async () => {
			// xterm 纯 client：动态加载，SSR 阶段不执行。
			// 注意：@xterm/xterm 的 ESM 只有 named exports（无 default），
			// 生产构建下 `import(...).default` 为 undefined，必须从 namespace 解构
			// xterm 核心样式必须随模块加载（缺失会导致终端只渲染出一个裸露 textarea）
			const [xtermMod, fitMod] = await Promise.all([
				import("@xterm/xterm"),
				import("@xterm/addon-fit"),
				import("@xterm/xterm/css/xterm.css").then(() => undefined),
			]);
			if (disposed) return;

			const { Terminal } = xtermMod;
			const { FitAddon } = fitMod;

			const term = new Terminal({
				fontFamily: "JetBrainsMono, monospace",
				fontSize: 14,
				cursorBlink: true,
				scrollback: 10_000,
				theme: { background: "#000000" },
			});
			const fit = new FitAddon();
			term.loadAddon(fit);
			// WebGL 渲染（docs 界面设计 §5.1）：GPU 加速单元格渲染；WebGL2 不可用时回退 DOM 渲染
			const webglMod = await import("@xterm/addon-webgl");
			const { WebglAddon } = webglMod;
			try {
				term.loadAddon(new WebglAddon());
			} catch {
				console.warn("WebGL 渲染不可用，终端回退 DOM 渲染");
			}
			term.open(container);
			fit.fit();
			termRef.current = term;
			fitAddon = fit;
			setConnected(true);

			// 键盘输入 → sendInputSFn。
			// 快速打字时 onData 回调密集且 sendInput 是异步网络调用，
			// 直接 fire-and-forget 会并发乱序，这里用队列串行发送保证 PTY 输入顺序
			const inputQueue: string[] = [];
			let inputFlushing = false;
			// 命令追踪：回车时记录用户执行的命令（terminal_command 审计，异步落库不阻塞输入）
			const tracker = createCommandTracker((command) => {
				void recordTerminalCommandSFn({ data: { sessionId, command } }).catch(
					() => {},
				);
			});
			const flushInput = async () => {
				if (inputFlushing) return;
				inputFlushing = true;
				try {
					while (inputQueue.length > 0) {
						const chunk = inputQueue.shift()!;
						const ptyId = ptyIdRef.current;
						if (!ptyId) return;
						await sendInputSFn({ data: { ptyId, data: chunk } });
					}
				} finally {
					inputFlushing = false;
				}
			};
			inputDisposable = term.onData((data) => {
				tracker.handleInput(data);
				if (!ptyIdRef.current) return;
				inputQueue.push(data);
				void flushInput();
			});

			try {
				const { ptyId } = await createPtySFn({
					data: { sessionId, cols: term.cols, rows: term.rows },
				});
				if (disposed) return;
				ptyIdRef.current = ptyId;

				// 订阅 PTY 输出流（SFn 流式，逐块解码写入终端）
				abort = new AbortController();
				const stream = await ptyStreamSFn({
					data: { sessionId },
					signal: abort.signal,
				});
				// await 期间组件已卸载：请求已发出无法中止，取消返回的流避免服务端残留 pty 推送
				if (disposed) {
					void stream?.cancel().catch(() => {});
					return;
				}
				if (!stream) return;
				ptyReader = stream.getReader();
				const decoder = new TextDecoder();
				for (;;) {
					const { done, value } = await ptyReader.read();
					if (done) break;
					if (disposed) return;
					const text = decoder.decode(value, { stream: true });
					// 输出流同时喂给命令追踪器（检测密码提示，抑制密码行落审计）
					tracker.consumeOutput(text);
					term.write(text);
				}
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					term.write(`\r\n[连接失败] ${(err as Error).message}\r\n`);
				}
			}
		})();

		// 尺寸自适应：fit + resize 上报
		resizeObserver = new ResizeObserver(() => {
			fitAddon?.fit();
			const ptyId = ptyIdRef.current;
			const term = termRef.current;
			if (ptyId && term) {
				void resizePtySFn({
					data: { ptyId, cols: term.cols, rows: term.rows },
				});
			}
		});
		resizeObserver.observe(container);

		return () => {
			disposed = true;
			abort?.abort();
			void ptyReader?.cancel().catch(() => {});
			inputDisposable?.dispose();
			resizeObserver?.disconnect();
			termRef.current?.dispose();
			termRef.current = null;
			fitAddon = null;
			// 关闭终端时销毁 PTY（否则服务端 getBySession 返回已断流的旧 pty，重开黑屏）
			const ptyId = ptyIdRef.current;
			if (ptyId) void closePtySFn({ data: { ptyId } });
		};
	}, [sessionId]);

	return (
		<div
			ref={containerRef}
			className="h-full w-full overflow-hidden bg-black p-1"
		>
			{!connected && (
				<div
					className="absolute bottom-2 left-2 text-xs"
					style={{ color: "var(--muted)" }}
				>
					连接中…
				</div>
			)}
		</div>
	);
}
