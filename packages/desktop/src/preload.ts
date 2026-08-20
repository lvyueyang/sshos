/**
 * preload：向渲染进程暴露最小平台信息。
 * 渲染层通信一律走 SFn / Server Route，不直接暴露 ipc（架构铁律）。
 */

import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("sshOS", {
	platform: process.platform,
});
