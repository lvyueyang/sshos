/**
 * App 生命周期分发器（docs 技术架构 §6.3）：
 * 四钩子 onCreate / onRestore / onSave / onShutdown 的顺序执行
 */

import type { AppDefinition } from "./registry";
import type { AppContext, Disposable, ShutdownReason } from "./types";

/** 创建实例：onCreate(ctx)，返回 Disposable */
export function dispatchCreate(
	def: AppDefinition,
	ctx: AppContext,
): Disposable | undefined | void {
	return def.lifecycle?.onCreate?.(ctx);
}

/** 还原状态：有上次保存状态时 onRestore(state) */
export function dispatchRestore(def: AppDefinition, state: unknown): void {
	if (state !== undefined) def.lifecycle?.onRestore?.(state);
}

/** 保存状态：Tab 关闭 / 系统退出前调用，返回可序列化 JSON */
export function dispatchSave(def: AppDefinition): unknown {
	return def.lifecycle?.onSave?.();
}

/** 关闭实例：区分系统退出 / Tab 关闭 / 手动关闭 */
export function dispatchShutdown(
	def: AppDefinition,
	reason: ShutdownReason,
): void {
	def.lifecycle?.onShutdown?.(reason);
}
