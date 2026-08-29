/**
 * TanStack Start + Vite 构建配置（对齐 fsdx 分层）：
 * routeFileIgnorePattern 防御性忽略非路由文件；importProtection 阻止 ssh2 等纯服务端依赖进入 renderer bundle
 */

import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	build: {
		rolldownOptions: {
			// ssh2 为 CJS（内部使用 __dirname / 原生依赖），打包进 ESM 会挂；
			// pi-coding-agent 打包后 createAgentSession 挂起（spike 非打包正常）；
			// 均 external 运行时由 Node 加载。cpu-features 是 ssh2 的可选原生加速（.node），同理
			external: ["cpu-features", "ssh2", "@earendil-works/pi-coding-agent"],
		},
	},
	optimizeDeps: {
		// ssh2 / cpu-features 仅服务端使用（import-protection 已挡 client 引用），
		// dev 依赖预构建不解析原生依赖
		exclude: ["ssh2", "cpu-features"],
	},
	plugins: [
		devtools(),
		tailwindcss(),
		tanstackStart({
			router: {
				// 防御性忽略非路由文件（apps/ 不在 routes/ 下，本无路由生成冲突）
				routeFileIgnorePattern: "\\.(functions|server|schemas).ts$|__tests__",
			},
			importProtection: {
				client: {
					// 禁止 ssh2 / Pi SDK 等纯服务端依赖进入 renderer bundle
					specifiers: ["ssh2", "@earendil-works/pi-coding-agent"],
				},
				// Server Route（routes/api/*）的 server.handlers 为服务端专属，由 tanstackStart 提取；
				// 文件内服务端 import 由 server env 编译，client env 跳过检查
				ignoreImporters: ["**/routes/api/**"],
			},
		}),
		viteReact(),
		// Nitro 负责生产打包，server.ts 被自动检测为服务端入口。
		// features.websocket 开启 PTY WebSocket 网关（决策记录「PTY 通道 WebSocket」）：
		// 生产 node preset 挂 upgrade 监听，dev 的 vite dev server 同样透传（vite.dev.mjs）。
		// serverDir 声明服务端目录扫描（server/routes/** → 路由），否则 nitro 不扫描任何服务端路由
		nitro({ serverDir: "server", features: { websocket: true } }),
	],
});
