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

/** AI 对话式安装的预填提示（来自安装引导，docs 发行版适配计划 §3） */
export interface AiInstallPrompt {
	sessionId: string;
	/** 预填进 AI 面板输入框的 prompt 文本 */
	prompt: string;
}

interface UiState {
	/** 自增信号计数，Sidebar 消费后归零（signal = 0 表示无待处理请求） */
	connectionDrawerSignal: number;
	/** 与当前信号关联的预填内容（一次性，消费后清空） */
	connectionDrawerPrefill: ConnectionPrefill | null;
	requestNewConnection(prefill?: ConnectionPrefill): void;
	/** 消费信号并返回预填内容（无信号时返回 null） */
	consumeNewConnection(): ConnectionPrefill | null;
	/** AI 安装预填信号（自增计数，AiPanel 消费后归零） */
	aiInstallSignal: number;
	aiInstallPrompt: AiInstallPrompt | null;
	requestAiInstall(prompt: AiInstallPrompt): void;
	/** 消费 AI 安装预填内容；传 sessionId 时仅匹配该会话才消费，避免多 Tab 互抢 */
	consumeAiInstall(sessionId?: string): AiInstallPrompt | null;
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
	aiInstallSignal: 0,
	aiInstallPrompt: null,
	requestAiInstall: (prompt) =>
		set((s) => ({
			aiInstallSignal: s.aiInstallSignal + 1,
			aiInstallPrompt: prompt,
		})),
	consumeAiInstall: (sessionId) => {
		const prompt = get().aiInstallPrompt;
		// 不匹配的会话不消费也不清空，留给目标会话的 AiPanel
		if (!prompt || (sessionId && prompt.sessionId !== sessionId)) return null;
		set({ aiInstallSignal: 0, aiInstallPrompt: null });
		return prompt;
	},
}));
