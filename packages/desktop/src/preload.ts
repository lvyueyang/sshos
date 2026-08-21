/**
 * preload：向渲染进程暴露最小平台信息与鉴权 token。
 * 渲染层通信一律走 SFn / Server Route，不直接暴露 ipc（架构铁律）。
 * 鉴权 token（D19）经 additionalArguments 传入（见 main.ts createWindow）。
 */

import { contextBridge } from "electron";

/** main 注入的鉴权 token（渲染层所有 SFn / Server Route 请求携带，见决策记录 D19） */
const authToken = process.argv
	.find((a) => a.startsWith("--ssh-os-auth-token="))
	?.split("=")[1];

contextBridge.exposeInMainWorld("sshOS", {
	platform: process.platform,
	authToken,
});
