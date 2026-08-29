/**
 * 会话失效恢复 hook（决策记录「会话接管与空闲回收」③）：
 * heartbeat 探测到 alive=false 会把 tab 置 offline（且已清空 sessionId），
 * 本 hook 对这些 offline 的 tab 自动重连（connectSFn 服务端幂等：会话真死则新建），
 * 成功后回写新 sessionId → 桌面各窗口（如终端）随 sessionId 变化自动重建续上；
 * 连续失败超上限后置 error 交还用户（侧栏点击仍可再触发重连）。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { connectSFn } from "#/apps/terminal/terminal.functions";
import { useDesktopStore } from "#/stores/windows";

/** 自动重连上限与退避间隔（避免服务不可达时无限重试） */
const RECOVERY_MAX_RETRIES = 3;
const RECOVERY_RETRY_DELAY_MS = 10_000;

/** 对 offline tab 自动兜底重连；卸载时清理待执行的退避定时器 */
export function useSessionRecovery(): void {
	const queryClient = useQueryClient();
	const retriesRef = useRef(new Map<number, number>());
	const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
	const inFlightRef = useRef(new Set<number>());

	useEffect(() => {
		const timers = timersRef.current;
		return () => {
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
		};
	}, []);

	const recover = useCallback(
		(connectionId: number) => {
			if (inFlightRef.current.has(connectionId)) return;
			inFlightRef.current.add(connectionId);
			const attempt = (retriesRef.current.get(connectionId) ?? 0) + 1;
			retriesRef.current.set(connectionId, attempt);

			void connectSFn({ data: { connectionId } })
				.then(({ sessionId }) => {
					inFlightRef.current.delete(connectionId);
					retriesRef.current.delete(connectionId);
					timersRef.current.delete(connectionId);
					useDesktopStore
						.getState()
						.setSession(connectionId, sessionId, "online");
					void queryClient.invalidateQueries({ queryKey: ["connections"] });
				})
				.catch((err: unknown) => {
					inFlightRef.current.delete(connectionId);
					if (attempt >= RECOVERY_MAX_RETRIES) {
						// 多次失败放弃，置 error 交还用户（侧栏点击可再触发）
						retriesRef.current.delete(connectionId);
						useDesktopStore
							.getState()
							.setSession(connectionId, undefined, "error");
						return;
					}
					console.warn(
						`会话重连失败(${attempt}/${RECOVERY_MAX_RETRIES}):`,
						err,
					);
					const timer = setTimeout(() => {
						timersRef.current.delete(connectionId);
						recover(connectionId);
					}, RECOVERY_RETRY_DELAY_MS);
					timersRef.current.set(connectionId, timer);
				});
		},
		[queryClient],
	);

	const tabs = useDesktopStore((s) => s.tabs);
	useEffect(() => {
		for (const tab of tabs) {
			// offline 且 sessionId 已清空 = 会话确认失效，触发兜底重连；
			// 已有退避定时器或在途请求时跳过，避免每次 tabs 变化都多发
			if (tab.status === "offline" && tab.sessionId === undefined) {
				if (
					!timersRef.current.has(tab.connectionId) &&
					!inFlightRef.current.has(tab.connectionId)
				) {
					recover(tab.connectionId);
				}
			}
		}
	}, [tabs, recover]);
}
