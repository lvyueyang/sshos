/**
 * PTY WebSocket 握手票据（决策记录「PTY 通道 WebSocket」）：
 * 一次性、绑定 sessionId、TTL 内有效。由 ptyWsTicketSFn 签发、WS 网关消费。
 * 挂 globalThis（对齐 pty-manager / ssh-manager 的跨环境共享模式）：
 * 票据在 dev 的 ssr 环境签发、nitro 环境消费，实例需跨模块共享。
 */

import { randomUUID } from "node:crypto";

/** 票据有效期：客户端在拿到票据后应立即建连，过期需重新签发 */
const TICKET_TTL_MS = 15_000;
const GLOBAL_KEY = "__SSHOS_PTY_TICKETS__";

interface PtyTicketEntry {
	sessionId: string;
	expiresAt: number;
}

interface PtyTicketRegistry {
	byTicket: Map<string, PtyTicketEntry>;
	bySession: Map<string, Set<string>>;
}

function getRegistry(): PtyTicketRegistry {
	const g = globalThis as Record<string, unknown>;
	const existing = g[GLOBAL_KEY];
	if (existing) return existing as PtyTicketRegistry;
	const registry: PtyTicketRegistry = {
		byTicket: new Map(),
		bySession: new Map(),
	};
	g[GLOBAL_KEY] = registry;
	return registry;
}

/** 清理过期票据（顺带回收 bySession 索引），避免 Map 无限增长 */
function purgeExpired(registry: PtyTicketRegistry, now: number): void {
	for (const [ticket, entry] of registry.byTicket) {
		if (entry.expiresAt > now) continue;
		registry.byTicket.delete(ticket);
		registry.bySession.get(entry.sessionId)?.delete(ticket);
	}
}

/** 签发一次性握手票据（绑定 sessionId，TTL 内有效） */
export function createPtyTicket(sessionId: string): string {
	const registry = getRegistry();
	purgeExpired(registry, Date.now());
	const ticket = randomUUID();
	const entry: PtyTicketEntry = {
		sessionId,
		expiresAt: Date.now() + TICKET_TTL_MS,
	};
	registry.byTicket.set(ticket, entry);
	const set = registry.bySession.get(sessionId);
	if (set) set.add(ticket);
	else registry.bySession.set(sessionId, new Set([ticket]));
	return ticket;
}

/** 消费票据：有效则一次性删除并返回绑定的 sessionId，无效 / 过期返回 null */
export function consumePtyTicket(ticket: string): { sessionId: string } | null {
	const registry = getRegistry();
	const entry = registry.byTicket.get(ticket);
	if (!entry) return null;
	registry.byTicket.delete(ticket);
	registry.bySession.get(entry.sessionId)?.delete(ticket);
	if (entry.expiresAt <= Date.now()) return null;
	return { sessionId: entry.sessionId };
}

/** 会话断开时清理其全部未消费票据（disconnectSession 调用） */
export function clearPtyTicketsBySession(sessionId: string): void {
	const registry = getRegistry();
	for (const ticket of registry.bySession.get(sessionId) ?? []) {
		registry.byTicket.delete(ticket);
	}
	registry.bySession.delete(sessionId);
}
