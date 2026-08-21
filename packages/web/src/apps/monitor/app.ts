/**
 * monitor 应用插件（docs 技术架构 §6）：window + panel 双 surface，metrics 能力，单实例。
 * 完整监控窗口 + 桌面右上角状态卡片（自启 panel），共用同一份 metrics 快照流。
 */

import type {
	AppContext,
	AppDefinition,
	AppManifest,
} from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "monitor",
	title: "监控",
	icon: "chart",
	capabilities: ["metrics"],
	singleton: true,
	surfaces: [
		{ kind: "window", defaultSize: { w: 640, h: 440 } },
		{ kind: "panel", slot: "top-right", autoStart: true },
	],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 指标流随组件卸载自动停止（服务端在流断开时停采样）
		},
	};
}

export const app: AppDefinition = { manifest, setup };
