/**
 * 系统设置窗口 UI 状态（Zustand，全局）：打开状态 + 当前导航分组。
 * 系统设置为全局级（模型 / 主题不绑定任何连接），与 per-tab 的桌面窗口管理
 * （stores/windows.ts）分离，由 AppShell 层渲染（docs 技术架构 §8 扩展）。
 */

import { create } from "zustand";

/** 设置窗口左侧导航分组 */
export type SettingsSection = "model" | "general";

interface SettingsUiState {
	/** 窗口是否打开（单实例浮层） */
	open: boolean;
	/** 当前导航分组 */
	section: SettingsSection;
	/** 打开设置窗口（可选定位到指定分组） */
	openSettings(section?: SettingsSection): void;
	/** 关闭设置窗口 */
	closeSettings(): void;
	/** 切换导航分组 */
	setSection(section: SettingsSection): void;
}

export const useSettingsUiStore = create<SettingsUiState>((set) => ({
	open: false,
	section: "model",
	openSettings: (section) => set({ open: true, section: section ?? "model" }),
	closeSettings: () => set({ open: false }),
	setSection: (section) => set({ section }),
}));
