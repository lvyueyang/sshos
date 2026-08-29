/**
 * PTY WebSocket 网关（决策记录「PTY 通道 WebSocket」）：
 * 一次性票据握手（ptyWsTicketSFn 签发）→ 校验绑定 sessionId → 在 SSH 会话上创建
 * PTY channel。通道协议对齐 `@xterm/addon-attach`（成熟库承载，docs 技术架构 §5.3）：
 * 输出下行 = 原始终端流；输入上行 = 原始键盘字节流，其中 `\x1b[<rows>;<cols>R`
 * 为标准 resize 序列（xterm attach 范式），由本网关解析并调用 setWindow，不转发到 channel。
 * 连接关闭 / 远端 channel 断开时销毁 PTY。
 * 挂载路径 /api/pty-ws 由 Nitro 扫描 server/routes 生成，开启 features.websocket。
 */

import { StringDecoder } from "node:string_decoder";
import { defineWebSocketHandler } from "nitro";
import type { WebSocketHooks, WebSocketPeer } from "nitro/h3";
import { ptyManager, sshManager } from "#/services/ssh/connection/ssh.server";
import { consumePtyTicket } from "#/services/ssh/pty/ticket";

/** 单个连接的内部状态（挂在 peer.context 上，跨 hooks 共享） */
interface PtyWsState {
	ptyId: string | null;
	decoder: StringDecoder;
	/** resize 序列解析的跨 chunk 残留前缀（输入可能是用户字节 + 尺寸序列混排） */
	pendingInput: string;
	closed: boolean;
}

/** 发送缓冲高水位（字节）：客户端消费慢时暂停 ssh2 channel，drain 后恢复 */
const BACKPRESSURE_HIGH = 1 << 20;
/** 标准 resize 序列：`\x1b[<rows>;<cols>R`（xterm attach 范式） */
const RESIZE_SEQ = /\x1b\[(\d+);(\d+)R/g;
/** 输入尾部是否为 resize 序列前缀（跨 chunk 等后续字节，避免误截） */
const RESIZE_PREFIX = /\x1b(\[\d*(;\d*R?)?)?$/;

function getState(peer: WebSocketPeer): PtyWsState {
	const context = peer.context as { ptyState?: PtyWsState };
	return (context.ptyState ??= {
		ptyId: null,
		decoder: new StringDecoder(),
		pendingInput: "",
		closed: false,
	});
}

/** 销毁当前 PTY 并标记连接已结束（幂等） */
function closePty(state: PtyWsState): void {
	if (state.closed) return;
	state.closed = true;
	if (state.ptyId) {
		ptyManager.destroy(state.ptyId);
		state.ptyId = null;
	}
}

/**
 * 解析并消费输入流里的 resize 序列：
 * 命中 `\x1b[<rows>;<cols>R` → 调 setWindow 且不放行；其余字节原样返回（写 stdin）。
 * 输入尾部若为可能的序列前缀则滞留到下一 chunk（跨 message 也能正确匹配）。
 * 调用方保证 state.ptyId 已就绪（就绪前的输入在 message 钩子缓冲）。
 */
function consumeWithResize(state: PtyWsState, text: string): string {
	const combined = `${state.pendingInput}${text}`;
	state.pendingInput = "";

	let input = "";
	let lastIndex = 0;
	RESIZE_SEQ.lastIndex = 0;
	for (let m = RESIZE_SEQ.exec(combined); m; m = RESIZE_SEQ.exec(combined)) {
		input += combined.slice(lastIndex, m.index);
		ptyManager.resize(state.ptyId!, Number(m[2]), Number(m[1]));
		lastIndex = m.index + m[0].length;
	}
	const rest = combined.slice(lastIndex);
	const partial = rest.match(RESIZE_PREFIX);
	if (partial) {
		// 尾部可能是序列前缀：滞留，等下一 chunk 拼接判定
		input += rest.slice(0, partial.index ?? 0);
		state.pendingInput = rest.slice(partial.index ?? 0);
	} else {
		input += rest;
	}
	return input;
}

/** 输出下行：输出流在连接建立后（open 钩子）已绑定 */
function bindOutput(peer: WebSocketPeer, state: PtyWsState): void {
	const pty = ptyManager.get(state.ptyId!);
	// 原始终端流下行（StringDecoder 保证跨 chunk 的 UTF-8 多字节序列不损坏）
	pty.output.on("data", (chunk: Buffer) => {
		if (state.closed) return;
		peer.send(state.decoder.write(chunk));
		// 背压：发送缓冲超水位时暂停 channel，drain 钩子恢复
		if (peer.bufferedAmount > BACKPRESSURE_HIGH) pty.channel.pause();
	});
	// 远端 channel 断开（exit / 会话断开）→ 输出流结束 → 关闭 WS
	pty.output.on("end", () => {
		if (state.closed) return;
		closePty(state);
		peer.close(1000, "pty closed");
	});
}

/**
 * PTY 就绪后冲刷建连期间缓冲的输入（含 resize 序列）。
 * open 钩子异步创建 PTY，期间到达的输入/尺寸帧若不缓冲会丢帧（掉首命令）。
 */
function flushPending(state: PtyWsState): void {
	if (!state.pendingInput || !state.ptyId || state.closed) return;
	const buffered = state.pendingInput;
	state.pendingInput = "";
	const input = consumeWithResize(state, buffered);
	if (input && state.ptyId) ptyManager.write(state.ptyId, input);
}

/**
 * PTY 通道 hooks（独立导出供集成测试直接驱动：
 * 否则需拉起完整 HTTP/WS 链路才能触达，单测成本过高）。
 */
export const ptyWsHooks: Partial<WebSocketHooks> = {
	/** 票据鉴权：一次性消费，失败（缺失 / 无效 / 过期）拒绝升级 */
	upgrade(request) {
		const ticket = new URL(request.url).searchParams.get("ticket");
		const resolved = ticket ? consumePtyTicket(ticket) : null;
		if (!resolved) {
			throw new Response("无效或已过期的终端握手票据", { status: 401 });
		}
		return { context: { sessionId: resolved.sessionId } };
	},

	/** 连接建立：校验会话 + 创建 PTY（默认 80x24，实际尺寸由 resize 序列校正） */
	open(peer) {
		const state = getState(peer);
		const fail = () => {
			if (state.closed) return;
			peer.send("SSH 会话已断开");
			peer.close(1011, "pty error");
		};
		let session;
		try {
			session = sshManager.get(peer.context.sessionId as string);
		} catch {
			fail();
			return;
		}
		void ptyManager
			.create(session.client, {
				sessionId: session.sessionId,
				cols: 80,
				rows: 24,
			})
			.then((pty) => {
				if (state.closed) {
					// open 期间连接已关闭：丢弃刚创建的 PTY
					ptyManager.destroy(pty.ptyId);
					return;
				}
				state.ptyId = pty.ptyId;
				bindOutput(peer, state);
				// 冲刷建连期间缓冲的输入（首命令 / 初始 resize 不丢帧）
				flushPending(state);
			})
			.catch(fail);
	},

	/** 上行原始输入：解析 resize 序列后其余字节写入 stdin */
	message(peer, message) {
		const state = getState(peer);
		if (state.closed) return;
		const text = message.text();
		if (!state.ptyId) {
			// PTY 尚未就绪（open 异步创建中）：缓冲输入，就绪后一次性冲刷
			state.pendingInput += text;
			return;
		}
		const input = consumeWithResize(state, text);
		if (input) ptyManager.write(state.ptyId, input);
	},

	/** 发送缓冲排空：恢复被背压暂停的 ssh2 channel */
	drain(peer) {
		const state = getState(peer);
		if (!state.ptyId || state.closed) return;
		try {
			ptyManager.get(state.ptyId).channel.resume();
		} catch {
			// PTY 已不存在，忽略
		}
	},

	/** 连接关闭：销毁 PTY */
	close(peer) {
		closePty(getState(peer));
	},

	/** 连接错误：销毁 PTY */
	error(peer) {
		closePty(getState(peer));
	},
};

export default defineWebSocketHandler(ptyWsHooks);