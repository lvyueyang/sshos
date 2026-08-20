/**
 * terminal 应用插件（docs 技术架构 §6）：window surface，pty/sftp 能力，可多开。
 */

import type { AppContext, AppManifest } from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "terminal",
	title: "终端",
	icon: "terminal",
	capabilities: ["pty", "sftp"],
	surfaces: [{ kind: "window", defaultSize: { w: 720, h: 480 } }],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 终端实例由窗口组件自行管理 PTY 生命周期
		},
	};
}
