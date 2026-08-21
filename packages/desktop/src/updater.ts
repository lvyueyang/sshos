/**
 * 自动更新（W4）：electron-updater 从 GitHub Releases 拉取更新。
 * 仅在打包环境生效（isPackaged），dev 与本地未打包运行直接跳过；
 * 静默后台下载，退出时自动安装，不依赖 renderer（架构铁律：渲染层不直连 ipc）。
 */

import { app, Notification } from "electron";
import { autoUpdater } from "electron-updater";

/** 更新开关：仅打包环境生效；SSHOS_DISABLE_UPDATES=1 可关闭（本地验证产物用） */
export function initUpdater(): void {
	if (!app.isPackaged) return;
	if (process.env.SSHOS_DISABLE_UPDATES) return;
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.on("update-available", () => {
		new Notification({
			title: "SSH OS 更新可用",
			body: "新版本正在后台下载，退出时自动安装。",
		}).show();
	});
	autoUpdater.on("update-downloaded", () => {
		new Notification({
			title: "SSH OS 更新就绪",
			body: "新版本已下载完成，下次退出时自动安装。",
		}).show();
	});
	autoUpdater.on("error", (err) => {
		// 更新失败不阻塞应用（离线 / 无新版本等均静默降级）
		console.error("[updater] 检查更新失败", err.message);
	});
	// 网络不可达等失败由 error 事件兜底，不抛出
	void autoUpdater.checkForUpdates().catch(() => {});
}
