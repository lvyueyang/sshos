/**
 * 桌面 UI 触发信号 store 单元测试：连接抽屉预填与 AI 安装预填（会话匹配消费）
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "../ui";

describe("useUiStore 连接抽屉信号", () => {
	beforeEach(() => {
		useUiStore.setState({
			connectionDrawerSignal: 0,
			connectionDrawerPrefill: null,
		});
	});

	it("请求后信号自增，消费后归零并返回预填内容", () => {
		useUiStore
			.getState()
			.requestNewConnection({ host: "localhost", port: 2222 });
		const signal = useUiStore.getState().connectionDrawerSignal;
		expect(signal).toBe(1);
		expect(useUiStore.getState().consumeNewConnection()?.host).toBe(
			"localhost",
		);
		expect(useUiStore.getState().connectionDrawerSignal).toBe(0);
	});

	it("无信号时消费返回 null", () => {
		expect(useUiStore.getState().consumeNewConnection()).toBeNull();
	});
});

describe("useUiStore AI 安装预填信号", () => {
	beforeEach(() => {
		useUiStore.setState({ aiInstallSignal: 0, aiInstallPrompt: null });
	});

	it("匹配会话消费并清空", () => {
		useUiStore.getState().requestAiInstall({
			sessionId: "s1",
			prompt: "请安装 rsync",
		});
		expect(useUiStore.getState().consumeAiInstall("s1")?.prompt).toBe(
			"请安装 rsync",
		);
		expect(useUiStore.getState().aiInstallPrompt).toBeNull();
		expect(useUiStore.getState().aiInstallSignal).toBe(0);
	});

	it("不匹配会话不消费也不清空（留给目标会话，防多 Tab 互抢）", () => {
		useUiStore.getState().requestAiInstall({
			sessionId: "s2",
			prompt: "请安装 docker",
		});
		expect(useUiStore.getState().consumeAiInstall("s1")).toBeNull();
		// 目标会话 s2 仍可消费
		expect(useUiStore.getState().consumeAiInstall("s2")?.sessionId).toBe("s2");
	});

	it("无信号时消费返回 null", () => {
		expect(useUiStore.getState().consumeAiInstall("s1")).toBeNull();
	});
});
