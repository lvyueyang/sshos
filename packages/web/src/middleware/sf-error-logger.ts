/**
 * 全局 SFn 错误处理中间件（docs 技术架构 §7.8 错误处理规范）：
 * 鉴权失败记 warn、系统异常记 error，脱敏后记录，始终重新抛出
 */

import { createMiddleware } from "@tanstack/react-start";
import { logger } from "#/lib/logger";

export const sfErrorLogger = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const startedAt = Date.now();
		try {
			const result = await next();
			logger.debug({ durationMs: Date.now() - startedAt }, "SFn 调用完成");
			return result;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			// 鉴权失败（4xx 语义）记 warn，其余按系统异常记 error
			const level = /auth|unauthorized|forbidden/i.test(err.message)
				? "warn"
				: "error";
			logger[level](
				{ err: { message: err.message, name: err.name } },
				"SFn 调用失败",
			);
			throw error;
		}
	},
);
