/**
 * 主题偏好全局状态（Zustand）：scheme（明暗）/ palette（配色）/ density（间距密度）/ fontScale（字阶）。
 * 根元素属性（class + data-theme + data-density + data-font-scale）由 ThemeProvider 应用并持久化
 * （docs/06 §4.3：四维度主题适配，组件代码零分支感知）。
 */

import { create } from "zustand";

export type ThemeScheme = "light" | "dark";
/** 配色 palette：默认 github，未来追加 nord 等即新增主题覆盖文件 */
export type ThemePalette = "github";
/** 间距密度：compact / normal / comfortable（覆盖 --spacing 基础单元） */
export type ThemeDensity = "compact" | "normal" | "comfortable";
/** 字阶：sa / default / lg / xl（覆盖根 font-size，rem 全局缩放） */
export type FontScale = "sa" | "default" | "lg" | "xl";

export interface ThemePrefs {
	scheme: ThemeScheme;
	palette: ThemePalette;
	density: ThemeDensity;
	fontScale: FontScale;
}

interface ThemeState extends ThemePrefs {
	/** 启动恢复持久化偏好（ThemeProvider 挂载时调用） */
	hydrate(prefs: Partial<ThemePrefs>): void;
	/** 切换明暗 scheme（根元素 class） */
	setScheme(scheme: ThemeScheme): void;
	/** 切换配色 palette（根元素 data-theme） */
	setPalette(palette: ThemePalette): void;
	/** 切换间距密度（根元素 data-density） */
	setDensity(density: ThemeDensity): void;
	/** 切换字阶（根元素 data-font-scale） */
	setFontScale(fontScale: FontScale): void;
}

export const useThemeStore = create<ThemeState>((set) => ({
	scheme: "dark",
	palette: "github",
	density: "normal",
	fontScale: "default",

	hydrate: (prefs) => set((s) => ({ ...s, ...prefs })),

	setScheme: (scheme) => set({ scheme }),
	setPalette: (palette) => set({ palette }),
	setDensity: (density) => set({ density }),
	setFontScale: (fontScale) => set({ fontScale }),
}));
