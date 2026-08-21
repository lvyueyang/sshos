/**
 * App 实例注册表（docs 技术架构 §6.4）：按连接维护 AppManager 单例。
 * 渲染层 Desktop 通过 ensureAppManager 取用，Tab 关闭时 disposeAppManager 回收
 * （shutdownAll 驱动 onSave / onShutdown，实例销毁但状态保留）。
 */

import { AppManager, type AppManagerDeps } from "./app-manager";

const managers = new Map<number, AppManager>();

/** 取某连接的 AppManager；不存在则创建（会话 / 依赖变更时同步，见 updateSession） */
export function ensureAppManager(
	connectionId: number,
	sessionId: string,
	deps: AppManagerDeps,
): AppManager {
	let manager = managers.get(connectionId);
	if (!manager) {
		manager = new AppManager(connectionId, sessionId, deps);
		managers.set(connectionId, manager);
	} else {
		manager.updateSession(sessionId, deps);
	}
	return manager;
}

/** 取某连接的 AppManager（未创建返回 undefined） */
export function getAppManager(connectionId: number): AppManager | undefined {
	return managers.get(connectionId);
}

/** Tab 关闭：驱动全部实例 onShutdown(tabClose) 并从注册表移除 */
export function disposeAppManager(connectionId: number): void {
	const manager = managers.get(connectionId);
	if (!manager) return;
	managers.delete(connectionId);
	void manager.shutdownAll("tabClose");
}
