/**
 * App 视图注册表（docs/06 §3：替代外壳硬编码分发表）：
 * 每个 app 插件在此关联自身的视图组件（windowView / panelView / statusbarView），
 * Desktop / Taskbar 通过 getAppViews 通用渲染，不再各自硬编码内容分发表。
 */

import type { ComponentType } from "react";
import { AiPanel } from "#/apps/ai/AiPanel";
import { ClockStatusBar } from "#/apps/clock/ClockStatusBar";
import { FileManager } from "#/apps/files/FileManager";
import { LogsWindow } from "#/apps/logs/LogsWindow";
import { MonitorDashboard } from "#/apps/monitor/MonitorDashboard";
import { MonitorPanel } from "#/apps/monitor/MonitorPanel";
import { TerminalWindow } from "#/apps/terminal/TerminalWindow";

/** 需要会话上下文的视图组件 */
type SessionView = ComponentType<{ sessionId: string }>;
/** 无会话的状态栏视图（如时钟） */
type StatusbarView = ComponentType;

/** app 的三种 surface 视图 */
export interface AppViews {
	windowView?: SessionView;
	panelView?: SessionView;
	statusbarView?: StatusbarView;
}

const APP_VIEWS: Record<string, AppViews> = {
	terminal: { windowView: TerminalWindow },
	files: { windowView: FileManager },
	monitor: { windowView: MonitorDashboard, panelView: MonitorPanel },
	ai: { windowView: AiPanel },
	logs: { windowView: LogsWindow },
	clock: { statusbarView: ClockStatusBar },
};

/** 取 app 的 surface 视图；未注册时返回空对象（外壳安全跳过） */
export function getAppViews(appId: string): AppViews {
	return APP_VIEWS[appId] ?? {};
}
