/**
 * files 应用插件（docs 技术架构 §6）：window surface，sftp 能力，可多开。
 * 声明文件 / 文件夹右键菜单贡献点（D15）；处理器动作一律走 SFn，写操作自动过 Policy Engine。
 */

import type { AppContext, AppManifest } from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "files",
	title: "文件",
	icon: "folder",
	capabilities: ["sftp"],
	surfaces: [{ kind: "window", defaultSize: { w: 760, h: 520 } }],
	contributes: {
		contextMenus: [
			{
				id: "files.download",
				target: "file",
				label: "下载",
				group: "transfer",
				order: 10,
			},
			{
				id: "files.rename",
				target: "file",
				label: "重命名",
				group: "manage",
				order: 20,
			},
			{
				id: "files.delete",
				target: "file",
				label: "删除",
				group: "manage",
				order: 30,
			},
			{
				id: "files.rename.folder",
				target: "folder",
				label: "重命名",
				group: "manage",
				order: 20,
			},
			{
				id: "files.delete.folder",
				target: "folder",
				label: "删除",
				group: "manage",
				order: 30,
			},
		],
	},
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 菜单处理器随 app 启停回收（由框架级菜单聚合消费，当前组件内菜单直接走 SFn）
		},
	};
}
