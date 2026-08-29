/**
 * AppManager 测试：ctx.uiState（tab store 通道）set/get 随 tab 持久化、key 级合并、按连接隔离。
 */

import { beforeEach, describe, expect, it } from "vitest";
import { type TabConnection, useDesktopStore } from "#/stores/windows";
import { AppManager, type AppManagerDeps } from "../app-manager";
import { registerApp } from "../registry";
import type { AppDefinition } from "../types";

const TEST_APP_ID = "test-ui-state-app";

/** setup 结果快照：connectionId → 回读值 */
const results = new Map<number, { lastPath: unknown; scrollTop: unknown }>();

const testApp: AppDefinition = {
	manifest: {
		id: TEST_APP_ID,
		title: "测试",
		capabilities: [],
		surfaces: [],
	},
	setup: (ctx) => {
		const conn = ctx.session.connectionId;
		// 两次 set 验证 key 级合并不互相覆盖
		ctx.uiState.set("lastPath", `/cwd-${conn}`);
		ctx.uiState.set("scrollTop", conn * 10);
		results.set(conn, {
			lastPath: ctx.uiState.get("lastPath"),
			scrollTop: ctx.uiState.get("scrollTop"),
		});
		return { dispose: () => {} };
	},
};

/** 构造连接配置快照（mkTab 同款） */
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

/** AppManager 外部依赖桩：settings/audit/log 全为内存假实现 */
function makeDeps(store: Map<string, unknown>): AppManagerDeps {
	return {
		settings: {
			get: async (key) => store.get(key),
			set: async (key, value) => {
				store.set(key, value);
			},
		},
		audit: { record: () => Promise.resolve() },
		log: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
	};
}

describe("AppManager ctx.uiState（tab store 通道）", () => {
	beforeEach(() => {
		useDesktopStore.setState({ tabs: [], activeTabId: null });
		results.clear();
	});

	it("set 随 tab store 持久化，get 可回读", async () => {
		registerApp(testApp);
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		const manager = new AppManager(1, "sess-1", makeDeps(new Map()));
		await manager.start(TEST_APP_ID);

		expect(results.get(1)).toEqual({ lastPath: "/cwd-1", scrollTop: 10 });
		const tab = useDesktopStore
			.getState()
			.tabs.find((t) => t.connectionId === 1);
		expect(tab?.uiState[TEST_APP_ID]).toEqual({
			lastPath: "/cwd-1",
			scrollTop: 10,
		});
	});

	it("unset 字段返回 undefined；未打开连接的 app 读不到他人的状态", async () => {
		registerApp(testApp);
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		useDesktopStore.getState().openTab(mkConn(2, "b"), "online");
		const manager1 = new AppManager(1, "s1", makeDeps(new Map()));
		const manager2 = new AppManager(2, "s2", makeDeps(new Map()));
		await manager1.start(TEST_APP_ID);
		await manager2.start(TEST_APP_ID);

		expect(results.get(1)).toEqual({ lastPath: "/cwd-1", scrollTop: 10 });
		expect(results.get(2)).toEqual({ lastPath: "/cwd-2", scrollTop: 20 });
		const tabs = useDesktopStore.getState().tabs;
		expect(
			tabs.find((t) => t.connectionId === 1)?.uiState[TEST_APP_ID],
		).toEqual({ lastPath: "/cwd-1", scrollTop: 10 });
		expect(
			tabs.find((t) => t.connectionId === 2)?.uiState[TEST_APP_ID],
		).toEqual({ lastPath: "/cwd-2", scrollTop: 20 });
	});

	it("app 实例销毁不影响 tab.uiState（随 tab 生命周期）", async () => {
		registerApp(testApp);
		useDesktopStore.getState().openTab(mkConn(1, "a"), "online");
		const manager = new AppManager(1, "sess-1", makeDeps(new Map()));
		await manager.start(TEST_APP_ID);
		await manager.stop(TEST_APP_ID);

		const tab = useDesktopStore
			.getState()
			.tabs.find((t) => t.connectionId === 1);
		expect(tab?.uiState[TEST_APP_ID]).toEqual({
			lastPath: "/cwd-1",
			scrollTop: 10,
		});
	});
});
