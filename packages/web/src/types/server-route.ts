/**
 * Server Route（server.handlers）类型与辅助函数。
 * @tanstack/react-start 1.168.x 运行时已支持 route.options.server.handlers，
 * 但类型定义尚未暴露，此处补齐形态并安全接入 createFileRoute。
 */

import { createFileRoute, type FileRoutesByPath } from "@tanstack/react-router";

/** Server Route handler 执行上下文 */
export interface ServerRouteContext {
	request: Request;
	params: Record<string, string>;
	context: unknown;
	pathname: string;
	handlerType: "router";
}

/** Server Route handler：可直接返回 Response，或经 { middleware, handler } 包装 */
export type ServerRouteHandler =
	| ((ctx: ServerRouteContext) => Response | Promise<Response>)
	| {
			middleware?: unknown[];
			handler: (ctx: ServerRouteContext) => Response | Promise<Response>;
	  };

/** Server Route options 形态：按 HTTP 方法注册 handler（GET / POST / HEAD / ANY） */
export interface ServerRouteOptions {
	server: {
		middleware?: unknown[];
		handlers: Record<string, ServerRouteHandler>;
	};
}

/** 提取 createFileRoute 返回工厂的 options 参数类型 */
type FileRouteOptions<T extends keyof FileRoutesByPath> = Parameters<
	ReturnType<typeof createFileRoute<T>>
>[0];

/**
 * 定义 Server Route（流式 / 下载 / health 等服务端 handler）。
 * 保留 path 字面量约束与 server.handlers 的类型检查；上游类型补齐后可直接替换为
 * createFileRoute(path)({ server: {...} }) 的原生写法。
 */
export function defineServerRoute<T extends keyof FileRoutesByPath>(
	path: T,
	options: ServerRouteOptions,
) {
	const factory = createFileRoute<T>(path);
	return factory(options as unknown as FileRouteOptions<T>);
}
