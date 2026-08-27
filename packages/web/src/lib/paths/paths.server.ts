/**
 * 数据目录解析（docs 技术架构 §4.8）：
 * SSHOS_DATA_DIR 优先（测试注入 / Electron 覆盖），否则开发走 ~/.ssh-os-dev、
 * 生产走 ~/.ssh-os。数据库与运行时日志统一落此目录。
 */

import { homedir } from "node:os";
import { join } from "node:path";

// 用 vite 构建常量判定生产（构建时静态替换、所有打包实例一致），
// 避免运行时读 NODE_ENV 受 Nitro 强制 production 与模块加载时序影响导致
// logger / db 落到不同目录。非 vite 上下文（独立 node）回退 process.env.NODE_ENV
const PRODUCTION =
	import.meta.env?.PROD ?? process.env.NODE_ENV === "production";

/** 解析数据目录（用户级约定：开发 .ssh-os-dev / 生产 .ssh-os） */
export function getDataDir(): string {
	const override = process.env.SSHOS_DATA_DIR;
	if (override) return override;
	return join(homedir(), PRODUCTION ? ".ssh-os" : ".ssh-os-dev");
}
