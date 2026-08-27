/**
 * App 图标（docs/06 §6 / docs/07 §4）：消费 manifest.icon 字符串 → Remix 图标 + app 品牌色。
 * 渲染层禁止手写 emoji / Unicode / 首字母图标；品牌色走静态语义类（text-app-*）随主题切换。
 */

import {
	RiApps2Line,
	RiFolder2Line,
	RiLineChartLine,
	RiListUnordered,
	RiSparkling2Line,
	RiTerminalLine,
	RiTimeLine,
} from "@remixicon/react";
import { cn } from "#/utils";

/** manifest.icon → Remix 图标映射（见各 apps/<app>/app.ts 的 icon 声明） */
const APP_ICONS: Record<string, typeof RiTerminalLine> = {
	terminal: RiTerminalLine,
	folder: RiFolder2Line,
	spark: RiSparkling2Line,
	chart: RiLineChartLine,
	list: RiListUnordered,
	clock: RiTimeLine,
};

/** app id → 品牌色语义类（--app-* token；静态类保证 Tailwind 生成，随主题切换） */
const BRAND_CLASS: Record<string, string> = {
	terminal: "text-app-terminal",
	files: "text-app-files",
	monitor: "text-app-monitor",
	ai: "text-app-ai",
	logs: "text-app-logs",
	clock: "text-app-clock",
};

interface AppIconProps {
	/** manifest.icon 字符串（terminal/folder/spark/...）；未知回退通用图标 */
	icon?: string;
	/** app id：解析品牌色（text-app-*），未匹配则继承 currentColor */
	appId?: string;
	size?: number;
	className?: string;
}

/** 统一 App 图标渲染：图标图形 + 可选品牌色 */
export function AppIcon({ icon, appId, size = 16, className }: AppIconProps) {
	const Icon = (icon && APP_ICONS[icon]) || RiApps2Line;
	const brandClass = (appId && BRAND_CLASS[appId]) || undefined;
	return (
		<Icon
			size={size}
			aria-hidden="true"
			className={cn("shrink-0", brandClass, className)}
		/>
	);
}
