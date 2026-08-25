/**
 * logs 应用插件（docs 技术架构 §6）：window surface，无 SSH 能力（纯本地日志查询）。
 * 桌面图标打开日志窗口，统一查看 ai_audit / terminal_command / policy_decision 三类结构化日志。
 */

import type {
	AppContext,
	AppDefinition,
	AppManifest,
} from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "logs",
	title: "日志",
	icon: "list",
	capabilities: [],
	singleton: true,
	surfaces: [{ kind: "window", defaultSize: { w: 760, h: 500 } }],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 日志查询走 TanStack Query 缓存，无实例级资源需回收
		},
	};
}

export const app: AppDefinition = { manifest, setup };
