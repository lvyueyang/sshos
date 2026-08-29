/**
 * 连接发起 hook（docs 界面设计 §2.4 / 决策记录 D11）：
 * 打开或聚焦桌面 Tab 并建立 SSH 会话。侧栏点击与 ssh:// 深链共用同一入口，
 * 保证「一个连接 = 一个 Tab」语义一致（重复点击聚焦已有 Tab，不新建）。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { connectSFn } from "#/apps/terminal/terminal.functions";
import { type TabConnection, useDesktopStore } from "#/stores/windows";

/** 打开或聚焦连接：未打开则建 Tab（连接配置回落 store）+ 建立 SSH 会话 + 打开首个终端窗口 */
export function useConnect() {
	const queryClient = useQueryClient();
	const tabs = useDesktopStore((s) => s.tabs);
	const openTab = useDesktopStore((s) => s.openTab);
	const focusTab = useDesktopStore((s) => s.focusTab);
	const setSession = useDesktopStore((s) => s.setSession);
	const openWindow = useDesktopStore((s) => s.openWindow);

	const connectConnection = useCallback(
		async (connection: TabConnection) => {
			const { id } = connection;
			const existing = tabs.find((t) => t.connectionId === id);
			// 已在线/在建连：只聚焦，不重复发请求；offline/error（会话失效）才走重连
			if (
				existing &&
				existing.status !== "offline" &&
				existing.status !== "error"
			) {
				focusTab(id);
				return;
			}
			if (existing) {
				setSession(id, undefined, "connecting");
			} else {
				openTab(connection, "connecting");
			}
			try {
				const { sessionId } = await connectSFn({ data: { connectionId: id } });
				setSession(id, sessionId, "online");
				void queryClient.invalidateQueries({ queryKey: ["connections"] });
				// 新建 tab 时打开首个终端窗口（窗口内自行 createPty 消费流）；既有 tab 重连不重复开
				if (!existing) {
					openWindow(id, "terminal-1", {
						x: 60,
						y: 40,
						w: 720,
						h: 480,
					});
				}
			} catch (err) {
				setSession(id, undefined, "error");
				// 连接失败必须可见（docs/07 §6：不静默吞错）
				toast.error(
					`连接失败：${err instanceof Error ? err.message : String(err)}`,
				);
				console.error("连接失败:", err);
			}
		},
		[tabs, openTab, focusTab, setSession, openWindow, queryClient],
	);

	return { connectConnection };
}
