/**
 * 终端 WebSocket 客户端（docs 技术架构 §5.3）：
 * ptyWsTicketSFn 获取一次性票据 → 连接 /api/pty-ws，返回已打开的 WebSocket。
 * 通道协议由 `@xterm/addon-attach` 承载（成熟库）：输出下行原始流、输入上行原始字节流；
 * 终端尺寸经标准 resize 序列 `\x1b[<rows>;<cols>R` 由调用方发送（服务端解析并 setWindow）。
 */

import { ptyWsTicketSFn } from "./terminal.functions";

/** 依据当前页面协议推导 WS 地址（http→ws / https→wss） */
function buildWsUrl(ticket: string): string {
	const proto = window.location.protocol === "https:" ? "wss" : "ws";
	return `${proto}://${window.location.host}/api/pty-ws?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * 打开已就绪的终端 WebSocket（票据一次性、TTL 内有效）：
 * open 前失败（票据被拒 / 连接错误 / 提前关闭）会 reject，由调用方展示并重试。
 */
export async function openTerminalSocket(
	sessionId: string,
): Promise<WebSocket> {
	const { ticket } = await ptyWsTicketSFn({ data: { sessionId } });
	const socket = new WebSocket(buildWsUrl(ticket));

	return await new Promise<WebSocket>((resolve, reject) => {
		let settled = false;
		socket.addEventListener("open", () => {
			settled = true;
			resolve(socket);
		});
		socket.addEventListener("error", () => {
			if (!settled) {
				settled = true;
				reject(new Error("WebSocket 连接失败"));
			}
		});
		socket.addEventListener("close", () => {
			if (!settled) {
				settled = true;
				reject(new Error("WebSocket 连接已关闭"));
			}
		});
	});
}
