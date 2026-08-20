/**
 * 健康检查 Server Route：供 Electron main 启动后自检 web server 是否就绪
 */

import { defineServerRoute } from "#/types/server-route";

export const Route = defineServerRoute("/api/health", {
	server: {
		handlers: {
			GET: () =>
				new Response(JSON.stringify({ status: "ok" }), {
					headers: { "Content-Type": "application/json" },
				}),
		},
	},
});
