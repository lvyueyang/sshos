/**
 * 远程工具可用性 hook：按会话探测 App manifest 声明的工具（probeToolsSFn），
 * 结果走 TanStack Query（key = sessionId + 工具列表），TTL 与服务端缓存一致。
 * App 据此做 gate / hint / fallback 与安装引导。
 */

import { useQuery } from "@tanstack/react-query";
import { probeToolsSFn } from "#/services/capabilities/capabilities.functions";

interface UseRemoteToolsOptions {
	sessionId: string | undefined;
	tools: string[];
}

/** 批量探测远程工具；返回查询结果 + tool → 可用性映射 */
export function useRemoteTools({ sessionId, tools }: UseRemoteToolsOptions) {
	const query = useQuery({
		queryKey: ["remote-tools", sessionId, tools.join(",")],
		queryFn: () => probeToolsSFn({ data: { sessionId: sessionId!, tools } }),
		enabled: Boolean(sessionId) && tools.length > 0,
		staleTime: 60_000,
	});

	const availability: Record<string, boolean> = {};
	for (const item of query.data ?? []) {
		availability[item.tool] = item.available;
	}

	return { ...query, availability };
}
