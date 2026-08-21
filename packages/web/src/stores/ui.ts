/**
 * 桌面 UI 触发信号（Zustand）：跨组件唤醒 UI 的一次性信号。
 * 目前仅用于首页空状态唤起侧栏「新建连接」抽屉（首次引导，docs 界面设计 §4.4）。
 */

import { create } from "zustand";

interface UiState {
	/** 自增信号计数，Sidebar 消费后归零（signal = 0 表示无待处理请求） */
	connectionDrawerSignal: number;
	requestNewConnection(): void;
	consumeNewConnection(): void;
}

export const useUiStore = create<UiState>((set) => ({
	connectionDrawerSignal: 0,
	requestNewConnection: () =>
		set((s) => ({ connectionDrawerSignal: s.connectionDrawerSignal + 1 })),
	consumeNewConnection: () => set({ connectionDrawerSignal: 0 }),
}));
