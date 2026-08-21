/**
 * files 应用插件（docs 技术架构 §6）：window surface，sftp 能力，单实例。
 * 文件管理器窗口内容由 FileManager 组件承载；内置菜单项在组件内硬编码，
 * 第三方 app 的右键菜单贡献点（contributes.contextMenus）由框架聚合（docs 技术架构 §6.6）。
 */

import type {
	AppContext,
	AppDefinition,
	AppManifest,
} from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "files",
	title: "文件",
	icon: "folder",
	capabilities: ["sftp"],
	// 单实例（docs 技术架构 §6.5：仅 terminal 可多开）
	singleton: true,
	surfaces: [{ kind: "window", defaultSize: { w: 760, h: 520 } }],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 菜单处理器随 app 启停回收（由框架级菜单聚合消费）
		},
	};
}

export const app: AppDefinition = { manifest, setup };
