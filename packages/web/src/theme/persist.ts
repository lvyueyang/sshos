/**
 * 主题偏好持久化（setting 表）：appearance.theme / appearance.density / appearance.fontScale。
 * appearance.theme 兼容旧字符串值（"light"|"dark"）→ 映射为 { scheme, palette }（docs/06 §4.3）。
 */

import {
	getGlobalSettingSFn,
	setGlobalSettingSFn,
} from "#/services/settings/settings.functions";
import type {
	FontScale,
	ThemeDensity,
	ThemePalette,
	ThemePrefs,
	ThemeScheme,
} from "#/stores/theme";

export const THEME_KEY = "appearance.theme";
export const DENSITY_KEY = "appearance.density";
export const FONT_SCALE_KEY = "appearance.fontScale";

/** 解析 appearance.theme 存量值：兼容旧字符串 "light"/"dark" 与新对象 { scheme, palette } */
export function parseTheme(
	value: unknown,
): Pick<ThemePrefs, "scheme" | "palette"> | undefined {
	if (value === "light" || value === "dark") {
		return { scheme: value, palette: "github" };
	}
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (obj.scheme === "light" || obj.scheme === "dark") {
			const scheme = obj.scheme as ThemeScheme;
			// 当前仅 github 一个 palette；未来新增主题时在此按 obj.palette 扩展
			const palette: ThemePalette = "github";
			return { scheme, palette };
		}
	}
	return undefined;
}

function parseDensity(value: unknown): ThemeDensity | undefined {
	return value === "compact" || value === "normal" || value === "comfortable"
		? value
		: undefined;
}

function parseFontScale(value: unknown): FontScale | undefined {
	return value === "sa" ||
		value === "default" ||
		value === "lg" ||
		value === "xl"
		? value
		: undefined;
}

/** 启动恢复：读取持久化偏好（任一读取失败保持默认，不阻塞启动） */
export async function loadThemePrefs(): Promise<Partial<ThemePrefs>> {
	const prefs: Partial<ThemePrefs> = {};
	try {
		const theme = await getGlobalSettingSFn({ data: { key: THEME_KEY } });
		const parsed = parseTheme(theme);
		if (parsed) Object.assign(prefs, parsed);
	} catch {
		// 未配置 / 服务不可达：保持默认
	}
	try {
		const density = await getGlobalSettingSFn({ data: { key: DENSITY_KEY } });
		const d = parseDensity(density);
		if (d) prefs.density = d;
	} catch {
		// 忽略
	}
	try {
		const fontScale = await getGlobalSettingSFn({
			data: { key: FONT_SCALE_KEY },
		});
		const f = parseFontScale(fontScale);
		if (f) prefs.fontScale = f;
	} catch {
		// 忽略
	}
	return prefs;
}

/** 持久化偏好（仅写提供的字段；scheme/palette 合并为 appearance.theme 一个 key，写失败不阻断本地切换） */
export async function persistThemePrefs(
	prefs: Partial<ThemePrefs>,
): Promise<void> {
	const writes: Promise<unknown>[] = [];
	if (prefs.scheme !== undefined && prefs.palette !== undefined) {
		writes.push(
			setGlobalSettingSFn({
				data: {
					key: THEME_KEY,
					value: { scheme: prefs.scheme, palette: prefs.palette },
				},
			}),
		);
	}
	if (prefs.density !== undefined) {
		writes.push(
			setGlobalSettingSFn({ data: { key: DENSITY_KEY, value: prefs.density } }),
		);
	}
	if (prefs.fontScale !== undefined) {
		writes.push(
			setGlobalSettingSFn({
				data: { key: FONT_SCALE_KEY, value: prefs.fontScale },
			}),
		);
	}
	await Promise.allSettled(writes);
}
