/**
 * PTY WebSocket 网关 E2E 测试（SSH_TEST_HOST 门控，对齐 core ssh-integration）：
 * 真实连接开发测试机 → 票据握手 → 原始输入回显 → resize 序列 → 清理。
 * 协议对齐 @xterm/addon-attach（下行原始终端流 / 上行原始字节 + `\x1b[<rows>;<cols>R`
 * resize 序列）。未设 SSH_TEST_HOST 时跳过；默认连本地 2222（sshos-test / test / testpass）。
 * 直接驱动 ptyWsHooks（跨 ws 传输层的钩子），HTTP/WS 升级路径已由 dev/prod 启动探测覆盖。
 */

import { describe, expect, it } from "vitest";
import { ptyWsHooks } from "../../../../server/routes/api/pty-ws";
import { ptyManager, sshManager } from "../connection/ssh.server";
import type { ConnectionOptions } from "../connection/ssh-manager";
import { createPtyTicket } from "../pty/ticket";

const HOST = process.env.SSH_TEST_HOST ?? "localhost:2222";
const [host, portStr = "2222"] = HOST.split(":");
const port = Number(portStr);

const describeE2E = process.env.SSH_TEST_HOST ? describe : describe.skip;

/** hooks 参数中的 WebSocketPeer / Message 类型（测试用最小 mock 运行时只用到少数成员） */
type WsPeer = Parameters<NonNullable<typeof ptyWsHooks.open>>[0];
type WsMessage = Parameters<NonNullable<typeof ptyWsHooks.message>>[1];

/** 最小可用 crossws Peer 模拟：context 可变、send 记录、close 记录 */
function createFakePeer() {
	return {
		id: "test-peer",
		context: {} as Record<string, unknown>,
		sent: [] as string[],
		closeCode: undefined as number | undefined,
		bufferedAmount: 0,
		send(data: unknown) {
			this.sent.push(String(data));
		},
		close(code?: number, _reason?: string) {
			this.closeCode = code;
		},
	};
}

type FakePeer = ReturnType<typeof createFakePeer>;

function buildConnectionOptions(): ConnectionOptions {
	return {
		connectionId: 1,
		host,
		port,
		username: "test",
		authType: "password",
		password: "testpass",
	};
}

/** 模拟一次握手：票据 → upgrade → 合并 context → open（等待 PTY 就绪） */
async function handshakeAndOpen(peer: FakePeer, sessionId: string) {
	const ticket = createPtyTicket(sessionId);
	const up = ptyWsHooks.upgrade!(
		new Request(`ws://localhost/api/pty-ws?ticket=${ticket}`),
	) as { context: { sessionId: string } };
	Object.assign(peer.context, up.context);
	ptyWsHooks.open!(peer as unknown as WsPeer);
	await waitForPty(peer);
}

/** 等待 open 钩子异步创建 PTY 完成（peer.context.ptyState.ptyId 非空） */
async function waitForPty(peer: FakePeer, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const state = peer.context.ptyState as { ptyId: string | null } | undefined;
		if (state?.ptyId) return;
		await new Promise((r) => setTimeout(r, 50));
	}
	throw new Error("等待 PTY 创建超时");
}

/** 等 PTY 输出回显中出现目标文本（最多 15s） */
async function waitForOutput(
	peer: FakePeer,
	needle: string,
	timeoutMs = 15_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (peer.sent.join("").includes(needle)) return;
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`等待 PTY 输出超时（未包含 ${needle}）`);
}

describeE2E("PTY WebSocket 网关", () => {
	it("无票据 / 未知票据升级被拒（401）", () => {
		expect(() =>
			ptyWsHooks.upgrade!(new Request("ws://localhost/api/pty-ws")),
		).toThrow(Response);
		expect(() =>
			ptyWsHooks.upgrade!(
				new Request("ws://localhost/api/pty-ws?ticket=not-exist"),
			),
		).toThrow(Response);
	});

	it("票据一次性：消费后同票据再次升级被拒", () => {
		const ticket = createPtyTicket("test-session");
		const res = ptyWsHooks.upgrade!(
			new Request(`ws://localhost/api/pty-ws?ticket=${ticket}`),
		);
		expect(res).toMatchObject({ context: { sessionId: "test-session" } });
		expect(() =>
			ptyWsHooks.upgrade!(
				new Request(`ws://localhost/api/pty-ws?ticket=${ticket}`),
			),
		).toThrow(Response);
	});

	it("真实连接：open 建 PTY → 原始输入回显 → resize 序列 → close 清理", async () => {
		const session = await sshManager.connect(buildConnectionOptions());
		try {
			const peer = createFakePeer();
			await handshakeAndOpen(peer, session.sessionId);

			// 原始输入：写入命令并等待回显
			const marker = `sshos-ws-${Date.now()}`;
			ptyWsHooks.message!(
				peer as unknown as WsPeer,
				{
					text: () => `echo ${marker}\r`,
				} as unknown as WsMessage,
			);
			await waitForOutput(peer, marker);

			// resize 序列（rows;cols）不抛错且被消费（不转发到 stdin）
			ptyWsHooks.message!(
				peer as unknown as WsPeer,
				{
					text: () => "\x1b[40;120R",
				} as unknown as WsMessage,
			);
			await new Promise((r) => setTimeout(r, 50));

			// close：PTY 被销毁
			const ptyId = (peer.context.ptyState as { ptyId: string | null }).ptyId;
			ptyWsHooks.close!(peer as unknown as WsPeer, {});
			expect(() => ptyManager.get(ptyId!)).toThrow();
		} finally {
			sshManager.disconnect(session.sessionId);
		}
	});

	it("会话不存在时 open 直接关闭连接", async () => {
		const peer = createFakePeer();
		peer.context.sessionId = "no-such-session";
		ptyWsHooks.open!(peer as unknown as WsPeer);
		// open 内校验会话失败后发送错误并关闭（等一拍）
		await new Promise((r) => setTimeout(r, 100));
		expect(peer.closeCode).toBe(1011);
	});

	it("建连期间缓冲输入：PTY 就绪前到达的命令回显不丢失", async () => {
		const session = await sshManager.connect(buildConnectionOptions());
		try {
			const peer = createFakePeer();
			// 只做票据 + open（不等待 PTY 就绪），立即发输入
			const ticket = createPtyTicket(session.sessionId);
			const up = ptyWsHooks.upgrade!(
				new Request(`ws://localhost/api/pty-ws?ticket=${ticket}`),
			) as { context: { sessionId: string } };
			Object.assign(peer.context, up.context);
			ptyWsHooks.open!(peer as unknown as WsPeer);

			const marker = `sshos-early-${Date.now()}`;
			ptyWsHooks.message!(
				peer as unknown as WsPeer,
				{
					text: () => `echo ${marker}\r`,
				} as unknown as WsMessage,
			);

			await waitForPty(peer);
			await waitForOutput(peer, marker);
			ptyWsHooks.close!(peer as unknown as WsPeer, {});
		} finally {
			sshManager.disconnect(session.sessionId);
		}
	});
});
