/**
 * monitor 应用插件（docs 技术架构 §6）：window surface，metrics 能力，单实例。
 * 仪表盘组件消费 /api/metrics/:sessionId 快照流（Server Route 每 2s 一条 NDJSON）。
 */

import type { AppContext, AppManifest } from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "monitor",
	title: "监控",
	icon: "chart",
	capabilities: ["metrics"],
	// 每个 Tab 一个监控实例（一连接一 Tab，仪表盘流与桌面生命周期绑定）
	singleton: true,
	surfaces: [{ kind: "window", defaultSize: { w: 640, h: 440 } }],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// 指标流随组件卸载自动停止（服务端在流断开时停采样）
		},
	};
}
