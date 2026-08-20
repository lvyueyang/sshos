/**
 * TanStack Start 入口配置：全局中间件注册。
 * 决策记录 D2 要求零 CSRF（Electron 本地回环无跨站攻击面），
 * 此处仅挂全局 SFn 错误日志中间件。
 */

import { createStart } from "@tanstack/react-start";
import { sfErrorLogger } from "#/middleware/sf-error-logger";

export const startInstance = createStart(() => ({
	requestMiddleware: [],
	functionMiddleware: [sfErrorLogger],
}));
