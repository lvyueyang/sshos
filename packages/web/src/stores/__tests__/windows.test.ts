/**
 * 桌面 UI 状态 store 单元测试：Tab 生命周期与窗口管理器核心行为
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useDesktopStore } from "../windows";

describe("useDesktopStore Tab 管理", () => {
	beforeEach(() => {
		useDesktopStore.setState({
			tabs: [],
			windowsByTab: {},
			activeTabId: null,
		});
	});

	it("打开新 Tab 并设为焦点", () => {
		useDesktopStore.getState().openTab({
			connectionId: 1,
			title: "web-01",
			status: "connecting",
		});
		const state = useDesktopStore.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe(1);
	});

	it("重复打开同一连接只聚焦不新建（一连接一 Tab）", () => {
		const store = useDesktopStore.getState();
		store.openTab({ connectionId: 1, title: "web-01", status: "connecting" });
		store.openTab({ connectionId: 2, title: "web-02", status: "connecting" });
		store.openTab({ connectionId: 1, title: "web-01", status: "online" });
		const state = useDesktopStore.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe(1);
	});

	it("关闭 Tab 后焦点回退到相邻 Tab", () => {
		const store = useDesktopStore.getState();
		store.openTab({ connectionId: 1, title: "a", status: "online" });
		store.openTab({ connectionId: 2, title: "b", status: "online" });
		store.closeTab(2);
		const state = useDesktopStore.getState();
		expect(state.tabs).toHaveLength(1);
		expect(state.activeTabId).toBe(1);
	});

	it("连接成功后写入 sessionId 并更新状态", () => {
		useDesktopStore
			.getState()
			.openTab({ connectionId: 1, title: "a", status: "connecting" });
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
			windowsByTab: {},
			activeTabId: null,
		});
	});

	it("打开窗口分配 z-index，聚焦置顶", () => {
		useDesktopStore
			.getState()
			.openTab({ connectionId: 1, title: "a", status: "online" });
		const store = useDesktopStore.getState();
		store.openWindow(1, "terminal-1", { x: 40, y: 20, w: 640, h: 400 });
		store.openWindow(1, "terminal-2", { x: 100, y: 80, w: 800, h: 600 });
		const first = useDesktopStore.getState().windowsByTab[1]["terminal-1"];
		const second = useDesktopStore.getState().windowsByTab[1]["terminal-2"];
		expect(second.zIndex).toBeGreaterThan(first.zIndex);
		expect(second.x).toBe(100);
		expect(second.y).toBe(80);
		expect(second.w).toBe(800);
		expect(second.h).toBe(600);
	});

	it("最小化与关闭窗口", () => {
		useDesktopStore
			.getState()
			.openTab({ connectionId: 1, title: "a", status: "online" });
		const store = useDesktopStore.getState();
		store.openWindow(1, "w1", { x: 0, y: 0, w: 640, h: 400 });
		store.minimizeWindow(1, "w1");
		expect(useDesktopStore.getState().windowsByTab[1].w1.minimized).toBe(true);
		store.closeWindow(1, "w1");
		expect(useDesktopStore.getState().windowsByTab[1].w1).toBeUndefined();
	});

	it("关闭 Tab 清理其全部窗口", () => {
		const store = useDesktopStore.getState();
		store.openTab({ connectionId: 1, title: "a", status: "online" });
		store.openWindow(1, "w1", { x: 0, y: 0, w: 640, h: 400 });
		store.closeTab(1);
		expect(useDesktopStore.getState().windowsByTab[1]).toBeUndefined();
	});
});
