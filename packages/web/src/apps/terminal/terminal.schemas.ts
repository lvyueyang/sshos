/**
 * terminal 应用 SFn 入参出参 Zod schema（单一来源，服务层用 z.infer 派生）
 */

import { z } from "zod";

/** 建立 SSH 连接 */
export const connectSchema = z.object({
	connectionId: z.number().int().positive(),
});

export type ConnectInput = z.infer<typeof connectSchema>;

/** 获取 PTY WebSocket 握手票据（一次性、绑定 sessionId，WS 网关按票据鉴权） */
export const ptyWsTicketSchema = z.object({
	sessionId: z.string().min(1),
});

/** 心跳续租（决策记录「会话接管与空闲回收」：页面存活时周期调用，防空闲 TTL 误杀） */
export const heartbeatSchema = z.object({
	sessionId: z.string().min(1),
});

/** 断开 SSH 连接 */
export const disconnectSchema = z.object({
	sessionId: z.string().min(1),
});
