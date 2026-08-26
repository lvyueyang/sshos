/**
 * 主题提供者（docs/06 §4.3）：应用层主题入口。
 * 启动时恢复持久化偏好；订阅 theme store 变化自动持久化。
 * 根元素属性（class + data-theme + data-density + data-font-scale）由 RootDocument 从 store 渲染，
 * 此处只负责「恢复 + 持久化」，避免与 React 渲染冲突。
 */

import { type ReactNode, useEffect, useRef } from "react";
import { type ThemePrefs, useThemeStore } from "#/stores/theme";
import { loadThemePrefs, persistThemePrefs } from "./persist";

export function ThemeProvider({ children }: { children: ReactNode }) {
	// 恢复持久化偏好（仅一次；完成后才允许写回，避免把读取值重复回写）
	const hydrated = useRef(false);

	useEffect(() => {
		let cancelled = false;
		void loadThemePrefs().then((prefs) => {
			if (cancelled) return;
			useThemeStore.getState().hydrate(prefs);
			hydrated.current = true;
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// 偏好变化自动持久化（hydrate 完成后才写；仅写变化的 key）
	useEffect(() => {
		const unsub = useThemeStore.subscribe((state, prev) => {
			if (!hydrated.current) return;
			const patch: Partial<ThemePrefs> = {};
			if (state.scheme !== prev.scheme || state.palette !== prev.palette) {
				patch.scheme = state.scheme;
				patch.palette = state.palette;
			}
			if (state.density !== prev.density) patch.density = state.density;
			if (state.fontScale !== prev.fontScale) patch.fontScale = state.fontScale;
			if (Object.keys(patch).length === 0) return;
			void persistThemePrefs(patch);
		});
		return unsub;
	}, []);

	return <>{children}</>;
}
