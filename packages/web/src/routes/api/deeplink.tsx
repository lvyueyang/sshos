/**
 * ssh:// 深链转发（docs 界面设计 §4.6）：
 * Electron main 经 HTTP POST 注入深链 URL（架构铁律：渲染层不直连 ipcMain），
 * 渲染层 GET 消费并清空。URL 存内存态，单窗口生命周期足够。
 */

import { defineServerRoute } from "#/types/server-route";

let pendingDeepLink: string | null = null;

export const Route = defineServerRoute("/api/deeplink", {
	server: {
		handlers: {
			/** 接收深链（Electron main 推送）；校验 ssh:// 前缀与长度防滥用 */
			POST: async (ctx) => {
				const url = await ctx.request.text();
				if (!url.startsWith("ssh://") || url.length > 2048) {
					return new Response("invalid deep link", { status: 400 });
				}
				pendingDeepLink = url;
				return new Response(null, { status: 204 });
			},
			/** 消费并清空深链；无待处理时返回 204 */
			GET: () => {
				const url = pendingDeepLink;
				pendingDeepLink = null;
				if (!url) return new Response(null, { status: 204 });
				return new Response(JSON.stringify({ url }), {
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
