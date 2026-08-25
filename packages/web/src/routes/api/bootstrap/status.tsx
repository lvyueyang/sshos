/**
 * 启动初始化状态 Server Route：GET /api/bootstrap/status
 * 返回 bootstrap 是否完成（phase: running | ready），供前端渲染初始化载入界面。
 * 豁免鉴权：初始化完成前客户端无法取得登录 token。
 */

import { getBootstrapStatus } from "#/services/bootstrap/status";
import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/bootstrap/status", {
	server: {
		handlers: {
			GET: () =>
				new Response(JSON.stringify(getBootstrapStatus()), {
					headers: { "Content-Type": "application/json" },
				}),
		},
	},
});
