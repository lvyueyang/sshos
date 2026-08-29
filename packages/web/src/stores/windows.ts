/**
 * 桌面 UI 全局状态（Zustand）：Tab 列表 / 窗口管理器 / 焦点。
 * 一个连接 = 一个 Tab（决策记录「Tab 边界」），桌面布局与 app UI 态都长在 tab 上；
 * 经 zustand persist 持久化到 localStorage（决策记录「会话接管与空闲回收」），刷新后桌面回显。
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 窗口状态（纯客户端 · 决策记录 D10） */
export interface WindowState {
	zIndex: number;
	x: number;
	y: number;
	w: number;
	h: number;
	minimized: boolean;
	maximized: boolean;
}

/** 连接配置快照（与 listConnectionsSFn 一致，不含凭据）：建连时由 DB 回落 store，刷新后可离线回显 */
export interface TabConnection {
	id: number;
	title: string;
	host: string;
	port: number | null;
	username: string;
	authType: "password" | "privateKey" | "systemKey" | "agent";
	color: string | null;
	isProduction: boolean;
	aiEnabled: boolean;
}

/** 一个桌面 Tab = 一个 SSH 连接；窗口与 app UI 态跟随 tab 存在 */
export interface TabState {
	/** 连接配置快照（DB 回落，随 store 持久化） */
	connection: TabConnection;
	/** = connection.id（沿用既有访问路径） */
	connectionId: number;
	/** = connection.title */
	title: string;
	/** SSH 会话（连接成功后填充） */
	sessionId?: string;
	status: "connecting" | "online" | "offline" | "error";
	/** 桌面布局：本连接内打开的应用窗口与位姿（跟随 tab） */
	windows: Record<string, WindowState>;
	/** 各 app 的展示/操作上下文态（如 files 上次路径），按 appId 隔离（跟随 tab，docs 技术架构 §6.4） */
	uiState: Record<string, unknown>;
}

interface DesktopState {
	/** 打开的桌面 Tab（一个连接一个；数组序 = 排序，在数组里即打开） */
	tabs: TabState[];
	/** 当前聚焦 Tab（以 connectionId 标识） */
	activeTabId: number | null;
}

interface DesktopActions {
	openTab(connection: TabConnection, status: TabState["status"]): void;
	closeTab(connectionId: number): void;
	focusTab(connectionId: number): void;
	setSession(
		connectionId: number,
		sessionId: string | undefined,
		status: TabState["status"],
	): void;
	/** 写某连接下某 app 的 UI 态（`ctx.uiState` 网关底层通道） */
	setTabUiState(connectionId: number, appId: string, value: unknown): void;
	openWindow(
		tabId: number,
		windowId: string,
		bounds: Pick<WindowState, "x" | "y" | "w" | "h">,
	): void;
	focusWindow(tabId: number, windowId: string): void;
	minimizeWindow(tabId: number, windowId: string): void;
	moveWindow(
		tabId: number,
		windowId: string,
		pos: { x: number; y: number },
	): void;
	resizeWindow(
		tabId: number,
		windowId: string,
		size: { w: number; h: number },
	): void;
	/** 最大化 / 还原 */
	toggleMaximize(tabId: number, windowId: string): void;
	closeWindow(tabId: number, windowId: string): void;
}

/** 该 Tab 内下一个 z-index：取既有最大 +1，随持久化恢复的层级继续递增（避免窗口层级错乱） */
function nextWindowZIndex(state: DesktopState, connectionId: number): number {
	const windows =
		state.tabs.find((t) => t.connectionId === connectionId)?.windows ?? {};
	return Math.max(100, ...Object.values(windows).map((w) => w.zIndex)) + 1;
}

/** 对指定连接 Tab 的 windows 做不可变更新，返回 set() 的 state diff（tabs 字段） */
function patchTabWindows(
	state: DesktopState,
	connectionId: number,
	patch: (windows: Record<string, WindowState>) => void,
): { tabs: TabState[] } {
	return {
		tabs: state.tabs.map((t) => {
			if (t.connectionId !== connectionId) return t;
			const windows = { ...t.windows };
			patch(windows);
			return { ...t, windows };
		}),
	};
}

// localStorage 不可用时（SSR / node 测试环境）兜底为空实现，persist 静默跳过
function safeLocalStorage(): Storage {
	if (typeof localStorage !== "undefined") return localStorage;
	return {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
		clear: () => {},
		key: () => null,
		length: 0,
	};
}

export const useDesktopStore = create<DesktopState & DesktopActions>()(
	persist(
		(set) => ({
			tabs: [],
			activeTabId: null,

			openTab: (connection, status) =>
				set((state) => {
					// 一连接一 Tab：重复打开只聚焦，不新建
					if (state.tabs.some((t) => t.connectionId === connection.id)) {
						return { activeTabId: connection.id };
					}
					return {
						tabs: [
							...state.tabs,
							{
								connection,
								connectionId: connection.id,
								title: connection.title,
								status,
								windows: {},
								uiState: {},
							},
						],
						activeTabId: connection.id,
					};
				}),

			closeTab: (connectionId) =>
				set((state) => {
					const tabs = state.tabs.filter(
						(t) => t.connectionId !== connectionId,
					);
					return {
						tabs,
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

			setTabUiState: (connectionId, appId, value) =>
				set((state) => ({
					tabs: state.tabs.map((t) =>
						t.connectionId === connectionId
							? { ...t, uiState: { ...t.uiState, [appId]: value } }
							: t,
					),
				})),

			openWindow: (tabId, windowId, bounds) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						windows[windowId] = {
							...bounds,
							zIndex: nextWindowZIndex(state, tabId),
							minimized: false,
							maximized: false,
						};
					}),
				),

			focusWindow: (tabId, windowId) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						const win = windows[windowId];
						if (!win) return;
						// 聚焦置顶 + 取消最小化（任务栏点击还原）；换新对象驱动引用式订阅
						windows[windowId] = {
							...win,
							zIndex: nextWindowZIndex(state, tabId),
							minimized: false,
						};
					}),
				),

			minimizeWindow: (tabId, windowId) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						const win = windows[windowId];
						if (win) windows[windowId] = { ...win, minimized: true };
					}),
				),

			moveWindow: (tabId, windowId, pos) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						const win = windows[windowId];
						if (!win) return;
						windows[windowId] = { ...win, x: pos.x, y: pos.y };
					}),
				),

			resizeWindow: (tabId, windowId, size) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						const win = windows[windowId];
						if (!win) return;
						windows[windowId] = { ...win, w: size.w, h: size.h };
					}),
				),

			toggleMaximize: (tabId, windowId) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						const win = windows[windowId];
						if (win) windows[windowId] = { ...win, maximized: !win.maximized };
					}),
				),

			closeWindow: (tabId, windowId) =>
				set((state) =>
					patchTabWindows(state, tabId, (windows) => {
						delete windows[windowId];
					}),
				),
		}),
		{
			name: "ssh-os:desktop",
			storage: createJSONStorage(() => safeLocalStorage()),
			// 只持久化数据层（tabs 含窗口与 uiState；在数组里即打开，数组序即排序）
			partialize: (state) => ({
				tabs: state.tabs,
				activeTabId: state.activeTabId,
			}),
		},
	),
);
