/**
 * terminal 应用 SFn 包装（docs 技术架构 §5.4）：
 * connect / heartbeat / ptyWsTicket（WS 握手票据）/ disconnect。
 * PTY 通道本身走 WebSocket 全双工（决策记录「PTY 通道 WebSocket」），
 * SFn 仅负责建连、心跳、票据签发与断开。
 * 纯 SSH 逻辑在 services/ssh/connection/ssh.server.ts。
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/middleware/auth-guard";
import {
	connectSession,
	disconnectSession,
	touchSession,
} from "#/services/ssh/connection/ssh.server";
import { createPtyTicket } from "#/services/ssh/pty/ticket";
import {
	connectSchema,
	disconnectSchema,
	heartbeatSchema,
	ptyWsTicketSchema,
} from "./terminal.schemas";

/** 建立 SSH 连接（解密凭据；服务端按 connectionId 幂等——已有存活会话直接返回既有 sessionId） */
export const connectSFn = createServerFn({ method: "POST" })
	.validator(connectSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const session = await connectSession(data.connectionId);
		return {
			sessionId: session.sessionId,
			host: session.host,
			username: session.username,
		};
	});

/** 心跳续租：刷新会话 lastHeartbeatAt；alive=false 说明会话已失效，客户端降级重连 */
export const heartbeatSFn = createServerFn({ method: "POST" })
	.validator(heartbeatSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => ({
		alive: touchSession(data.sessionId),
	}));

/** 获取 PTY WebSocket 握手票据：一次性、绑定 sessionId、TTL 内有效（WS 网关按票据鉴权，见 server/routes/api/pty-ws） */
export const ptyWsTicketSFn = createServerFn({ method: "POST" })
	.validator(ptyWsTicketSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => ({
		ticket: createPtyTicket(data.sessionId),
	}));

/** 断开 SSH 连接 */
export const disconnectSFn = createServerFn({ method: "POST" })
	.validator(disconnectSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		disconnectSession(data.sessionId);
		return { ok: true };
	});
