/**
 * 认证 SFn（登录前可访问的公开接口）：
 * setupSFn 首次配置 / loginSFn 登录 / authStatusSFn 状态查询。
 * 不挂鉴权中间件，天然公开（fsdx 范式：需鉴权的 SFn 才挂 authMiddleware）。
 */

import { createServerFn } from "@tanstack/react-start";
import { authStatusSchema, passwordSchema } from "./auth.schemas";
import { getAuthStatus, loginServer, setupServer } from "./auth.server";

/** 首次配置：设置启动密码，返回登录 token（已配置时抛错） */
export const setupSFn = createServerFn({ method: "POST" })
	.validator(passwordSchema)
	.handler(async ({ data }) => {
		return { token: setupServer(data.password) };
	});

/** 登录：校验启动密码，返回 JWT（密码错误 / 未配置时抛错） */
export const loginSFn = createServerFn({ method: "POST" })
	.validator(passwordSchema)
	.handler(async ({ data }) => {
		return { token: loginServer(data.password) };
	});

/** 认证状态：configured / authenticated（入参携带客户端 token 用于验签） */
export const authStatusSFn = createServerFn({ method: "GET" })
	.validator(authStatusSchema)
	.handler(async ({ data }) => getAuthStatus(data.token));
