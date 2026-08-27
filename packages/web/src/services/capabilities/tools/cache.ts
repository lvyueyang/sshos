/**
 * 远程工具探测缓存（叶子模块，不依赖其他服务）：
 * 独立成模块以打破 capabilities.server ↔ ssh.server 的循环依赖，
 * 断开连接清理与探测读写共用同一份缓存。
 */

/** 会话级工具缓存条目（TTL 内整体复用，过期整体重探） */
export interface ToolCacheEntry {
	updatedAt: number;
	results: Map<string, boolean>;
}

export const toolCache = new Map<string, ToolCacheEntry>();

/** 工具缓存 TTL：与 UI staleTime 对齐，避免每次打开 app 都重新探测 */
export const TOOL_CACHE_TTL_MS = 60_000;

/** 清理会话工具缓存（断开连接时调用，随会话生命周期） */
export function clearToolCache(sessionId: string): void {
	toolCache.delete(sessionId);
}
