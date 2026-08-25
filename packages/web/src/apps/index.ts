/**
 * 内置 app 聚合注册（docs 技术架构 §6.4）：启动时一次性注册全部内置插件。
 * 重复注册会抛错，渲染层模块级调用仅执行一次。
 */

import { registerApp } from "#/app-framework/registry";
import { app as aiApp } from "./ai/app";
import { app as clockApp } from "./clock/app";
import { app as filesApp } from "./files/app";
import { app as logsApp } from "./logs/app";
import { app as monitorApp } from "./monitor/app";
import { app as terminalApp } from "./terminal/app";

/** 注册六个内置 app（terminal / files / monitor / ai / clock / logs，决策记录 D6） */
export function registerBuiltinApps(): void {
	registerApp(aiApp);
	registerApp(clockApp);
	registerApp(filesApp);
	registerApp(logsApp);
	registerApp(monitorApp);
	registerApp(terminalApp);
}
