/**
 * App 插件注册表（docs 技术架构 §6.4）：内置 app 静态聚合注册。
 * 每个 app 以 manifest + setup 定义，启动时按 capabilities 裁剪上下文。
 */

import type { AppDefinition } from "./types";

const registry = new Map<string, AppDefinition>();

/**
 * 注册内置 app；重复 id 以先注册者为准并告警（幂等，避免开发期模块热更新
 * 重新执行模块作用域时重复注册抛错）。
 */
export function registerApp(def: AppDefinition): void {
	if (registry.has(def.manifest.id)) {
		console.warn(`App 已注册，忽略重复注册: ${def.manifest.id}`);
		return;
	}
	registry.set(def.manifest.id, def);
}

/** 查询 app，未注册返回 undefined */
export function getApp(id: string): AppDefinition | undefined {
	return registry.get(id);
}

/** 列出全部已注册 app */
export function listApps(): AppDefinition[] {
	return [...registry.values()];
}

/** 注册声明 window surface 的 app（桌面图标渲染用） */
export function listWindowApps(): AppDefinition[] {
	return listApps().filter((d) =>
		d.manifest.surfaces.some((s) => s.kind === "window"),
	);
}

/** 注册声明 panel surface 的 app（桌面面板槽位渲染用） */
export function listPanelApps(): AppDefinition[] {
	return listApps().filter((d) =>
		d.manifest.surfaces.some((s) => s.kind === "panel"),
	);
}

/** 注册声明 statusbar surface 的 app（任务栏槽位渲染用） */
export function listStatusbarApps(): AppDefinition[] {
	return listApps().filter((d) =>
		d.manifest.surfaces.some((s) => s.kind === "statusbar"),
	);
}

/** 声明 autoStart surface 的 app（自启面板 / 状态栏） */
export function listAutoStartApps(): AppDefinition[] {
	return listApps().filter((d) =>
		d.manifest.surfaces.some((s) => "autoStart" in s && s.autoStart === true),
	);
}
