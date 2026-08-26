/**
 * 桌面 UI 全局状态（Zustand）：Tab 列表 / 窗口管理器 / 焦点。
 * 只存 UI 状态不存远程数据；流式数据不进全局 store（决策记录 D10）。
 */

import { create } from "zustand";

export interface WindowState {
	zIndex: number;
	x: number;
	y: number;
	w: number;
	h: number;
	minimized: boolean;
	maximized: boolean;
}

export interface TabState {
	connectionId: number;
	title: string;
	/** SSH 会话（连接成功后填充） */
	sessionId?: string;
	status: "connecting" | "online" | "offline" | "error";
}

interface DesktopState {
	/** 打开的桌面 Tab（一个连接一个 Tab） */
	tabs: TabState[];
	/** 每个 Tab 内的窗口管理器 */
	windowsByTab: Record<string, Record<string, WindowState>>;
	/** 当前聚焦 Tab */
	activeTabId: number | null;
}

interface DesktopActions {
	openTab(tab: TabState): void;
	closeTab(connectionId: number): void;
	focusTab(connectionId: number): void;
	setSession(
		connectionId: number,
		sessionId: string | undefined,
		status: TabState["status"],
	): void;
	openWindow(
		tabId: number,
		windowId: string,
		bounds: Pick<WindowState, "x" | "y" | "w" | "h">,
	): void;
	focusWindow(tabId: number, windowId: string): void;
	minimizeWindow(tabId: number, windowId: string): void;
	/** 移动窗口 */
	moveWindow(
		tabId: number,
		windowId: string,
		pos: { x: number; y: number },
	): void;
	/** 调整窗口大小 */
	resizeWindow(
		tabId: number,
		windowId: string,
		size: { w: number; h: number },
	): void;
	/** 最大化 / 还原 */
	toggleMaximize(tabId: number, windowId: string): void;
	closeWindow(tabId: number, windowId: string): void;
}

let maxZIndex = 100;

export const useDesktopStore = create<DesktopState & DesktopActions>((set) => ({
	tabs: [],
	windowsByTab: {},
	activeTabId: null,

	openTab: (tab) =>
		set((state) => {
			if (state.tabs.some((t) => t.connectionId === tab.connectionId)) {
				return { activeTabId: tab.connectionId };
			}
			return {
				tabs: [...state.tabs, tab],
				windowsByTab: { ...state.windowsByTab, [tab.connectionId]: {} },
				activeTabId: tab.connectionId,
			};
		}),

	closeTab: (connectionId) =>
		set((state) => {
			const tabs = state.tabs.filter((t) => t.connectionId !== connectionId);
			const windowsByTab = { ...state.windowsByTab };
			delete windowsByTab[connectionId];
			return {
				tabs,
				windowsByTab,
				activeTabId:
					state.activeTabId === connectionId
						? (tabs.at(-1)?.connectionId ?? null)
						: state.activeTabId,
			};
		}),

	focusTab: (connectionId) => set({ activeTabId: connectionId }),

	setSession: (connectionId, sessionId, status) =>
		set((state) => ({
			tabs: state.tabs.map((t) =>
				t.connectionId === connectionId ? { ...t, sessionId, status } : t,
			),
		})),

	openWindow: (tabId, windowId, bounds) =>
		set((state) => ({
			windowsByTab: {
				...state.windowsByTab,
				[tabId]: {
					...state.windowsByTab[tabId],
					[windowId]: {
						...bounds,
						zIndex: ++maxZIndex,
						minimized: false,
						maximized: false,
					},
				},
			},
		})),

	focusWindow: (tabId, windowId) =>
		set((state) => ({
			windowsByTab: {
				...state.windowsByTab,
				[tabId]: {
					...state.windowsByTab[tabId],
					[windowId]: {
						...state.windowsByTab[tabId][windowId],
						zIndex: ++maxZIndex,
						// 聚焦时取消最小化（任务栏点击还原）
						minimized: false,
					},
				},
			},
		})),

	minimizeWindow: (tabId, windowId) =>
		set((state) => ({
			windowsByTab: {
				...state.windowsByTab,
				[tabId]: {
					...state.windowsByTab[tabId],
					[windowId]: {
						...state.windowsByTab[tabId][windowId],
						minimized: true,
					},
				},
			},
		})),

	moveWindow: (tabId, windowId, pos) =>
		set((state) => ({
			windowsByTab: {
				...state.windowsByTab,
				[tabId]: {
					...state.windowsByTab[tabId],
					[windowId]: {
						...state.windowsByTab[tabId][windowId],
						x: pos.x,
						y: pos.y,
					},
				},
			},
		})),

	resizeWindow: (tabId, windowId, size) =>
		set((state) => ({
			windowsByTab: {
				...state.windowsByTab,
				[tabId]: {
					...state.windowsByTab[tabId],
					[windowId]: {
						...state.windowsByTab[tabId][windowId],
						w: size.w,
						h: size.h,
					},
				},
			},
		})),

	toggleMaximize: (tabId, windowId) =>
		set((state) => ({
			windowsByTab: {
				...state.windowsByTab,
				[tabId]: {
					...state.windowsByTab[tabId],
					[windowId]: {
						...state.windowsByTab[tabId][windowId],
						maximized: !state.windowsByTab[tabId][windowId].maximized,
					},
				},
			},
		})),

	closeWindow: (tabId, windowId) =>
		set((state) => {
			const tabWindows = { ...state.windowsByTab[tabId] };
			delete tabWindows[windowId];
			return { windowsByTab: { ...state.windowsByTab, [tabId]: tabWindows } };
		}),
}));
