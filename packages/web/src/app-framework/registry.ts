/**
 * App 插件注册表（docs 技术架构 §6.4）：内置 app 静态聚合注册。
 * 每个 app 以 manifest + setup 定义，启动时按 capabilities 裁剪上下文。
 */

import type { AppContext, AppManifest, Disposable } from "./types";

/** app 插件定义：manifest 声明 + setup 绑定生命周期 */
export interface AppDefinition {
	manifest: AppManifest;
	setup: (ctx: AppContext) => Disposable | undefined | void;
	/** 生命周期钩子（onCreate / onRestore / onSave / onShutdown） */
	lifecycle?: {
		onCreate?(ctx: AppContext): Disposable | undefined | void;
		onRestore?(state: unknown): void;
		onSave?(): unknown;
		onShutdown?(reason: "systemExit" | "tabClose" | "userClose"): void;
	};
}

const registry = new Map<string, AppDefinition>();

/** 注册内置 app；重复 id 抛错（先注册者优先语义由调用方保证） */
export function registerApp(def: AppDefinition): void {
	if (registry.has(def.manifest.id)) {
		throw new Error(`App 已注册: ${def.manifest.id}`);
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
