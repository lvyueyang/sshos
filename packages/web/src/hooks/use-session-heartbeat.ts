/**
 * 会话心跳续租 hook（决策记录「会话接管与空闲回收」）：对 store 中 online 的 tab
 * 周期调用 heartbeatSFn，续租服务端会话 lastHeartbeatAt，防空闲 TTL 把存活的页面误杀；
 * alive=false（如服务端重启）时把 tab 标记 offline，由后续兜底重连接回。
 */

import { useEffect } from "react";
import { heartbeatSFn } from "#/apps/terminal/terminal.functions";
import { useDesktopStore } from "#/stores/windows";

const HEARTBEAT_INTERVAL_MS = 30_000;

/** 页面存活标志：对每个 online tab 周期心跳续租；无 tab 时静默 */
export function useSessionHeartbeat(
	intervalMs: number = HEARTBEAT_INTERVAL_MS,
): void {
	const tabs = useDesktopStore((s) => s.tabs);

	useEffect(() => {
		const online = tabs.filter((t) => t.sessionId && t.status === "online");
		if (online.length === 0) return;
		// 逐 tab 心跳；失败静默（会话可能刚被服务端回收，下轮自然命中 alive=false 分支）
		const beat = () => {
			for (const tab of online) {
				void heartbeatSFn({ data: { sessionId: tab.sessionId! } })
					.then(({ alive }) => {
						if (!alive) {
							console.warn(`会话已失效，标记离线: ${tab.sessionId}`);
							useDesktopStore
								.getState()
								.setSession(tab.connectionId, undefined, "offline");
						}
					})
					.catch((err: unknown) => {
						// 服务端瞬断/重启期间每 30s 一拍，用 debug 避免刷屏；网络错误不置 offline（恢复仅认 alive=false）
						console.debug("[heartbeat] 心跳失败:", err);
					});
			}
		};
		// 首个包立刻发：刷新后尽快探测会话存活，缩短"会话已死"的感知窗口
		beat();
		const timer = setInterval(beat, intervalMs);
		return () => clearInterval(timer);
	}, [tabs, intervalMs]);
}
