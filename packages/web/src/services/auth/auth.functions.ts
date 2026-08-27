/**
 * 认证 SFn（登录前可访问的公开接口）：
 * setupSFn 首次配置 / loginSFn 登录 / authStatusSFn 状态查询。
 * 定义后立即注册到公开集合（lib/public-sfns），全局鉴权中间件据此豁免。
 */

import { createServerFn } from "@tanstack/react-start";
import { registerPublicSfn } from "#/lib/public-sfns/public-sfns";
import { authStatusSchema, passwordSchema } from "./auth.schemas";
import { getAuthStatus, loginServer, setupServer } from "./auth.server";

/** 首次配置：设置启动密码，返回登录 token（已配置时抛错） */
export const setupSFn = createServerFn({ method: "POST" })
	.validator(passwordSchema)
	.handler(async ({ data }) => {
		return { token: setupServer(data.password) };
	});
registerPublicSfn(setupSFn.url);

/** 登录：校验启动密码，返回 JWT（密码错误 / 未配置时抛错） */
export const loginSFn = createServerFn({ method: "POST" })
	.validator(passwordSchema)
	.handler(async ({ data }) => {
		return { token: loginServer(data.password) };
	});
registerPublicSfn(loginSFn.url);

/** 认证状态：configured / authenticated（入参携带客户端 token 用于验签） */
export const authStatusSFn = createServerFn({ method: "GET" })
	.validator(authStatusSchema)
	.handler(async ({ data }) => getAuthStatus(data.token));
registerPublicSfn(authStatusSFn.url);
