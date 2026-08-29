/**
 * 终端窗口（docs 界面设计 §5）：基于 xterm.js + `@xterm/addon-attach` 承载 WebSocket 全双工通道
 * （决策记录「PTY 通道 WebSocket」：ptyWsTicketSFn 票据握手 → addon-attach 直连）。
 * 终端尺寸经标准 resize 序列 `\x1b[<rows>;<cols>R` 下发（服务端解析并 setWindow）。
 * xterm 为 CJS 且纯 client，组件内动态 import，SSR 不加载（避免模块 interop 问题）。
 */

import type { ITheme, Terminal as TerminalType } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { recordTerminalCommandSFn } from "#/services/audit/terminal/terminal.functions";
import { createCommandTracker } from "./command-tracker";
import { openTerminalSocket } from "./pty-ws-client";

interface TerminalWindowProps {
	sessionId: string;
}

/** Monokai 兜底色板（与 globals.css .term-monokai 一致；CSS 变量缺失时回退） */
const MONOKAI: Record<string, string> = {
	"--terminal-bg": "#272822",
	"--terminal-fg": "#f8f8f2",
	"--terminal-ansi-0": "#272822",
	"--terminal-ansi-1": "#f92672",
	"--terminal-ansi-2": "#a6e22e",
	"--terminal-ansi-3": "#f4bf75",
	"--terminal-ansi-4": "#66d9ef",
	"--terminal-ansi-5": "#ae81ff",
	"--terminal-ansi-6": "#a1efe4",
	"--terminal-ansi-7": "#f8f8f2",
	"--terminal-ansi-8": "#75715e",
	"--terminal-ansi-9": "#f92672",
	"--terminal-ansi-10": "#a6e22e",
	"--terminal-ansi-11": "#f4bf75",
	"--terminal-ansi-12": "#66d9ef",
	"--terminal-ansi-13": "#ae81ff",
	"--terminal-ansi-14": "#a1efe4",
	"--terminal-ansi-15": "#f9f8f5",
};

/** 从 CSS 变量读取 xterm 主题（docs/03 §5.10：终端色板独立，作用域 .term-monokai） */
function readTerminalTheme(container: HTMLElement): ITheme {
	const s = getComputedStyle(container);
	const v = (name: string) => s.getPropertyValue(name).trim() || MONOKAI[name];
	const ansi = (i: number) => v(`--terminal-ansi-${i}`);
	return {
		background: v("--terminal-bg"),
		foreground: v("--terminal-fg"),
		cursor: ansi(5),
		black: ansi(0),
		red: ansi(1),
		green: ansi(2),
		yellow: ansi(3),
		blue: ansi(4),
		magenta: ansi(5),
		cyan: ansi(6),
		white: ansi(7),
		brightBlack: ansi(8),
		brightRed: ansi(9),
		brightGreen: ansi(10),
		brightYellow: ansi(11),
		brightBlue: ansi(12),
		brightMagenta: ansi(13),
		brightCyan: ansi(14),
		brightWhite: ansi(15),
	};
}

/** 从 CSS 变量读取终端字号（--terminal-font-size，默认 14px） */
function readTerminalFontSize(container: HTMLElement): number {
	const raw = getComputedStyle(container)
		.getPropertyValue("--terminal-font-size")
		.trim();
	const px = Number.parseFloat(raw);
	return Number.isFinite(px) && px > 0 ? px : 14;
}

export function TerminalWindow({ sessionId }: TerminalWindowProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<TerminalType | null>(null);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		// 会话失效/恢复窗口期 sessionId 为空：不建连，等 recovery 写入新 sessionId 后本 effect 重跑重建
		if (!sessionId) return;

		let disposed = false;
		let socket: WebSocket | null = null;
		let attach: { dispose(): void } | null = null;
		let onWsMessage: ((ev: MessageEvent) => void) | null = null;
		let inputDisposable: { dispose(): void } | null = null;
		let resizeDisposable: { dispose(): void } | null = null;
		let fitAddon: { fit(): void } | null = null;
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
				fontFamily: "JetBrains Mono Variable, monospace",
				fontSize: readTerminalFontSize(container),
				cursorBlink: true,
				scrollback: 10_000,
				theme: readTerminalTheme(container),
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

			try {
				// 先加载 addon chunk，再开 socket：消除 socket open 到 loadAddon 之间
				// 的异步空窗（该窗口期到达的下行帧浏览器不缓冲、会丢首屏 shell banner）
				const { AttachAddon } = await import("@xterm/addon-attach");
				if (disposed) return;

				// 票据握手 → 已打开的 WebSocket（协议由 @xterm/addon-attach 承载）
				const ws = await openTerminalSocket(sessionId);
				if (disposed) {
					ws.close();
					return;
				}
				socket = ws;

				// 命令追踪：回车时记录用户执行的命令（terminal_command 审计，异步落库不阻塞输入）。
				// 输入喂 tracker；输出由本组件的 message 监听喂 tracker（与 addon 的消息监听并存）
				const tracker = createCommandTracker((command) => {
					void recordTerminalCommandSFn({ data: { sessionId, command } }).catch(
						() => {},
					);
				});
				inputDisposable = term.onData((data) => tracker.handleInput(data));
				onWsMessage = (ev) => {
					if (disposed) return;
					// addon-attach 设置 binaryType=arraybuffer，服务端下行文本帧时为 string
					const text =
						typeof ev.data === "string"
							? ev.data
							: new TextDecoder().decode(new Uint8Array(ev.data));
					tracker.consumeOutput(text);
				};
				ws.addEventListener("message", onWsMessage);

				// 承载通道：addon-attach（socket 已 OPEN，loadAddon 不会因状态抛错）
				const attachAddon = new AttachAddon(ws);
				term.loadAddon(attachAddon);
				attach = attachAddon;

				// 终端尺寸经标准 resize 序列下发（服务端解析并 setWindow）
				const sendResize = () => {
					if (socket?.readyState === WebSocket.OPEN) {
						socket.send(`\x1b[${term.rows};${term.cols}R`);
					}
				};
				resizeDisposable = term.onResize(sendResize);
				sendResize();
			} catch (err) {
				if (disposed) return;
				// 失败时回收已打开的 socket（addon 加载 / 握手异常等路径），避免挂起
				socket?.close();
				socket = null;
				term.write(
					`\r\n[连接失败] ${err instanceof Error ? err.message : String(err)}\r\n`,
				);
				setConnected(false);
			}
		})();

		// 尺寸自适应：fit + resize 上报（经 resize 序列）
		resizeObserver = new ResizeObserver(() => {
			fitAddon?.fit();
		});
		resizeObserver.observe(container);

		return () => {
			disposed = true;
			inputDisposable?.dispose();
			resizeDisposable?.dispose();
			if (socket && onWsMessage)
				socket.removeEventListener("message", onWsMessage);
			attach?.dispose();
			socket?.close();
			resizeObserver?.disconnect();
			termRef.current?.dispose();
			termRef.current = null;
			fitAddon = null;
		};
	}, [sessionId]);

	return (
		<div
			ref={containerRef}
			className="term-monokai h-full w-full overflow-hidden p-1 [background:var(--terminal-bg)]"
		>
			{!connected && (
				<div className="absolute bottom-2 left-2 text-xs text-muted-foreground">
					连接中…
				</div>
			)}
		</div>
	);
}
