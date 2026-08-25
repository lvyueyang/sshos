/**
 * 启动初始化（docs 技术架构 §9）：应用命名、ssh:// 深链协议注册。
 * 数据库迁移与预置数据由 web server 启动时执行（fail-fast）；
 * 认证 / 凭据加密由 web 服务自洽（D21），壳不注入任何密钥或 token。
 * 深链为壳自己的本地职责：冷启动经 URL 参数带给渲染层，运行时聚焦窗口。
 */

import { app, BrowserWindow } from "electron";

/** 最近一次 ssh:// 深链 URL（冷启动经 URL 参数传给渲染层，见 main.ts） */
export let pendingDeepLink: string | null = null;

/** 深链处理器（main 注册；运行时仅聚焦窗口，不重新导航） */
let deepLinkHandler: ((url: string) => void) | null = null;

/** 注册深链处理器：每次捕获到 ssh:// 深链都会回调 */
export function onDeepLink(handler: (url: string) => void): void {
	deepLinkHandler = handler;
}

/** 统一深链入口：暂存 + 回调 + 聚焦窗口 */
function handleDeepLink(url: string): void {
	if (!url.startsWith("ssh://")) return;
	pendingDeepLink = url;
	deepLinkHandler?.(url);
	focusMainWindow();
}

// 事件监听在模块作用域注册：macOS 冷启动点击 ssh:// 链接时 open-url 先于 ready 触发，
// 若在 bootstrap（ready 后）才注册会漏掉首次深链；此时窗口未建，仅暂存 pendingDeepLink
app.on("second-instance", (_event, argv) => {
	// Windows / Linux 深链随 argv 传入（已有实例运行时走此路径）
	const url = argv.find((a) => a.startsWith("ssh://"));
	if (url) handleDeepLink(url);
	focusMainWindow();
});
app.on("open-url", (event, url) => {
	event.preventDefault();
	handleDeepLink(url);
});

// Windows / Linux 冷启动深链随 process.argv 传入（无运行实例时不会触发 second-instance，
// 取到单实例锁的正是本实例，需在此捕获；macOS 走 open-url，argv 通常不含深链，无副作用）
const argvDeepLink = process.argv.find((a) => a.startsWith("ssh://"));
if (argvDeepLink) handleDeepLink(argvDeepLink);

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
