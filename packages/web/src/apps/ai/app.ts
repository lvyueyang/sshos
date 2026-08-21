/**
 * ai 应用插件（docs 技术架构 §6）：window surface，exec + ai 能力。
 * 面板组件消费 /api/ai/chat SSE 流；AI 工具命令经 execCommandSFn（Policy Engine）二次拦截。
 */

import type {
	AppContext,
	AppDefinition,
	AppManifest,
} from "#/app-framework/types";

export const manifest: AppManifest = {
	id: "ai",
	title: "AI",
	icon: "spark",
	capabilities: ["exec", "ai"],
	singleton: true,
	surfaces: [{ kind: "window", defaultSize: { w: 420, h: 560 } }],
};

export function setup(_ctx: AppContext) {
	return {
		dispose: () => {
			// AI 会话为请求级（服务端每次 prompt 创建），无实例级资源需回收
		},
	};
}

export const app: AppDefinition = { manifest, setup };
