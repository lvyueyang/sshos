/**
 * 桌面 UI 触发信号（Zustand）：跨组件唤醒 UI 的一次性信号。
 * 目前用于首页空状态与 ssh:// 深链唤起侧栏「新建连接」抽屉（docs 界面设计 §4.4 / §4.6）。
 */

import { create } from "zustand";

/** 新建连接抽屉的预填内容（来自 ssh:// 深链解析，docs §4.6） */
export interface ConnectionPrefill {
	title?: string;
	host?: string;
	port?: number;
	username?: string;
}

interface UiState {
	/** 自增信号计数，Sidebar 消费后归零（signal = 0 表示无待处理请求） */
	connectionDrawerSignal: number;
	/** 与当前信号关联的预填内容（一次性，消费后清空） */
	connectionDrawerPrefill: ConnectionPrefill | null;
	requestNewConnection(prefill?: ConnectionPrefill): void;
	/** 消费信号并返回预填内容（无信号时返回 null） */
	consumeNewConnection(): ConnectionPrefill | null;
}

export const useUiStore = create<UiState>((set, get) => ({
	connectionDrawerSignal: 0,
	connectionDrawerPrefill: null,
	requestNewConnection: (prefill) =>
		set((s) => ({
			connectionDrawerSignal: s.connectionDrawerSignal + 1,
			connectionDrawerPrefill: prefill ?? null,
		})),
	consumeNewConnection: () => {
		const prefill = get().connectionDrawerPrefill;
		set({ connectionDrawerSignal: 0, connectionDrawerPrefill: null });
		return prefill;
	},
}));
