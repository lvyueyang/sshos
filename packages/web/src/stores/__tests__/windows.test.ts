/**
 * 桌面 UI 状态 store 单元测试：Tab 生命周期与窗口管理器核心行为
 */

import { beforeEach, describe, expect, it } from "vitest";
import { type TabConnection, useDesktopStore } from "../windows";

/** 构造一条连接配置快照（等价 listConnectionsSFn 非凭据行） */
function mkConn(id: number, title: string): TabConnection {
	return {
		id,
		title,
		host: `host-${id}`,
		port: 22,
		username: "test",
		authType: "password",
		color: null,
		isProduction: false,
		aiEnabled: true,
	};
}

describe("useDesktopStore Tab 管理", () => {
	beforeEach(() => {
		useDesktopStore.setState({
			tabs: [],
			activeTabId: null,
		});
	});

	it("打开新 Tab 并设为焦点，连接配置回落 store", () => {
		useDesktopStore.getState().openTab(mkConn(1, "web-01"), "connecting");
		const tab = useDesktopStore.getState().tabs[0];
		expect(tab.connectionId).toBe(1);
		expect(tab.title).toBe("web-01");
		expect(tab.connection.host).toBe("host-1");
		expect(tab.connection.authType).toBe("password");
		expect(useDesktopStore.getState().activeTabId).toBe(1);
	});

	it("重复打开同一连接只聚焦不新建（一连接一 Tab）", () => {
		const store = useDesktopStore.getState();
		store.openTab(mkConn(1, "web-01"), "connecting");
		store.openTab(mkConn(2, "web-02"), "connecting");
		store.openTab(mkConn(1, "web-01"), "online");
		const state = useDesktopStore.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe(1);
	});

	it("关闭 Tab 后焦点回退到相邻 Tab", () => {
		const store = useDesktopStore.getState();
		store.openTab(mkConn(1, "a"), "online");
		store.openTab(mkConn(2, "b"), "online");
		store.closeTab(2);
		const state = useDesktopStore.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe(1);
	});

	it("连接成功后写入 sessionId 并更新状态", () => {
		useDesktopStore.getState().openTab(mkConn(1, "a"), "connecting");
		useDesktopStore.getState().setSession(1, "sess-1", "online");
		const tab = useDesktopStore.getState().tabs[0];
		expect(tab.sessionId).toBe("sess-1");
		expect(tab.status).toBe("online");
	});
});

describe("useDesktopStore 窗口管理器", () => {
	beforeEach(() => {
		useDesktopStore.setState({
			tabs: [],
			activeTabId: null,
		});
	});

	it("打开窗口分配 z-index，聚焦置顶", () => {
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		const store = useDesktopStore.getState();
		store.openWindow(1, "terminal-1", { x: 40, y: 20, w: 640, h: 400 });
		store.openWindow(1, "terminal-2", { x: 100, y: 80, w: 800, h: 600 });
		const windows = useDesktopStore.getState().tabs[0].windows;
		const first = windows["terminal-1"];
		const second = windows["terminal-2"];
		expect(second.zIndex).toBeGreaterThan(first.zIndex);
		expect(second.x).toBe(100);
		expect(second.y).toBe(80);
		expect(second.w).toBe(800);
		expect(second.h).toBe(600);
	});

	it("最小化与关闭窗口", () => {
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		const store = useDesktopStore.getState();
		store.openWindow(1, "w1", { x: 0, y: 0, w: 640, h: 400 });
		store.minimizeWindow(1, "w1");
		expect(useDesktopStore.getState().tabs[0].windows.w1.minimized).toBe(true);
		store.closeWindow(1, "w1");
		expect(useDesktopStore.getState().tabs[0].windows.w1).toBeUndefined();
	});

	it("窗口位姿更新不可变（换新对象，驱动引用式订阅）", () => {
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		const store = useDesktopStore.getState();
		store.openWindow(1, "w1", { x: 0, y: 0, w: 640, h: 400 });
		const before = useDesktopStore.getState().tabs[0].windows.w1;
		store.moveWindow(1, "w1", { x: 99, y: 33 });
		const after = useDesktopStore.getState().tabs[0].windows.w1;
		expect(after).not.toBe(before);
		expect(after.x).toBe(99);
		expect(after.y).toBe(33);
	});

	it("UI 态按 connectionId 与 appId 隔离落 tab", () => {
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		useDesktopStore.getState().openTab(mkConn(2, "b"), "online");
		useDesktopStore.getState().setTabUiState(1, "files", {
			lastPath: "/var/www",
		});
		useDesktopStore.getState().setTabUiState(2, "files", {
			lastPath: "/root",
		});
		const tabs = useDesktopStore.getState().tabs;
		expect(tabs.find((t) => t.connectionId === 1)?.uiState.files).toEqual({
			lastPath: "/var/www",
		});
		expect(tabs.find((t) => t.connectionId === 2)?.uiState.files).toEqual({
			lastPath: "/root",
		});
	});

	it("关闭 Tab 清理其全部窗口", () => {
		const store = useDesktopStore.getState();
		store.openTab(mkConn(1, "a"), "online");
		store.openWindow(1, "w1", { x: 0, y: 0, w: 640, h: 400 });
		store.closeTab(1);
		expect(
			useDesktopStore.getState().tabs.some((t) => t.connectionId === 1),
		).toBe(false);
	});
});
