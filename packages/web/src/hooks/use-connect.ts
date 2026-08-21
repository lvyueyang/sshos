/**
 * 连接发起 hook（docs 界面设计 §2.4 / 决策记录 D11）：
 * 打开或聚焦桌面 Tab 并建立 SSH 会话。侧栏点击与 ssh:// 深链共用同一入口，
 * 保证「一个连接 = 一个 Tab」语义一致（重复点击聚焦已有 Tab，不新建）。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { connectSFn } from "#/apps/terminal/terminal.functions";
import { useDesktopStore } from "#/stores/windows";

/** 打开或聚焦连接：未打开则建 Tab + 建立 SSH 会话 + 打开首个终端窗口 */
export function useConnect() {
	const queryClient = useQueryClient();
	const tabs = useDesktopStore((s) => s.tabs);
	const openTab = useDesktopStore((s) => s.openTab);
	const focusTab = useDesktopStore((s) => s.focusTab);
	const setSession = useDesktopStore((s) => s.setSession);
	const openWindow = useDesktopStore((s) => s.openWindow);

	const connectConnection = useCallback(
		async (connectionId: number, title: string) => {
			if (tabs.some((t) => t.connectionId === connectionId)) {
				focusTab(connectionId);
				return;
			}
			openTab({ connectionId, title, status: "connecting" });
			try {
				const { sessionId } = await connectSFn({ data: { connectionId } });
				setSession(connectionId, sessionId, "online");
				void queryClient.invalidateQueries({ queryKey: ["connections"] });
				// 打开首个终端窗口（窗口内自行 createPty 消费流）
				openWindow(connectionId, "terminal-1", {
					x: 60,
					y: 40,
					w: 720,
					h: 480,
				});
			} catch (err) {
				setSession(connectionId, undefined, "error");
				console.error("连接失败:", err);
			}
		},
		[tabs, openTab, focusTab, setSession, openWindow, queryClient],
	);

	return { connectConnection };
}
