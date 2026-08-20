/**
 * SSH 会话状态 hook：基于 TanStack Query 缓存服务端会话数据。
 * 消费 SFn（connectSFn 等，P4 落地）后按 queryKey 失效刷新。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

/** queryKey 约定：SFn 名 + 入参（决策记录 D10），供失效刷新复用 */
export function sessionQueryKey(connectionId: number) {
	return ["session", connectionId] as const;
}

/** 读取某连接当前会话状态（未连接时为 undefined） */
export function useSessionStatus(connectionId: number | undefined) {
	return useQuery({
		queryKey: ["session-status", connectionId],
		queryFn: async () => undefined,
		enabled: connectionId !== undefined,
		staleTime: Infinity,
	});
}

/** 会话相关数据变更后统一失效刷新 */
export function useInvalidateSession() {
	const queryClient = useQueryClient();
	return (connectionId: number) => {
		void queryClient.invalidateQueries({
			queryKey: sessionQueryKey(connectionId),
		});
	};
}
