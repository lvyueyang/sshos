/**
 * clock 应用插件（docs 技术架构 §6.3）：statusbar surface · 自启 · 常驻。
 * 状态栏内容由 ClockStatusBar 组件渲染（组件内每秒自刷新），实例生命周期仅占位。
 */

import type {
	AppContext,
	AppDefinition,
	AppManifest,
} from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "clock",
	title: "时钟",
	icon: "clock",
	capabilities: [],
	singleton: true,
	surfaces: [{ kind: "statusbar", slot: "right", autoStart: true }],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 状态栏内容自刷新的定时器由 ClockStatusBar 组件持有
		},
	};
}

export const app: AppDefinition = { manifest, setup };
