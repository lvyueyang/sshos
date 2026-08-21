/**
 * 启动初始化（docs 技术架构 §9）：应用命名、ssh:// 深链协议注册。
 * 数据库迁移与预置数据由 web server 启动时执行（fail-fast）；
 * 凭据加密（safeStorage 注入 setCredentialEncryptor）为 W4 打包前置，见决策记录「凭据加密降级」。
 */

import { app, BrowserWindow } from "electron";

/** 最近一次 ssh:// 深链 URL（渲染层发起连接时消费，见 docs 界面设计 §4.6） */
export let pendingDeepLink: string | null = null;

// 事件监听在模块作用域注册：macOS 冷启动点击 ssh:// 链接时 open-url 先于 ready 触发，
// 若在 bootstrap（ready 后）才注册会漏掉首次深链；此时窗口未建，仅暂存 pendingDeepLink
app.on("second-instance", () => {
	focusMainWindow();
});
app.on("open-url", (event, url) => {
	event.preventDefault();
	pendingDeepLink = url;
	focusMainWindow();
});

/** 聚焦主窗口（最小化时还原）；窗口未创建时无操作 */
function focusMainWindow(): void {
	const win = BrowserWindow.getAllWindows()[0];
	if (!win) return;
	if (win.isMinimized()) win.restore();
	win.focus();
}

export async function bootstrap(): Promise<void> {
	app.setName("SSH OS");
	// 协议默认处理器需 app ready 后注册（macOS 上 open-url 事件本身在 ready 前已被上方监听捕获）
	app.setAsDefaultProtocolClient("ssh");
}
