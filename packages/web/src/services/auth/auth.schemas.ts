/**
 * 认证入参校验（Zod schema 单一来源；SFn handler 内 safeParse 兜底，TS7 validator 链暂缓）。
 */

import { z } from "zod";

/** 启动密码（setup / login 共用；仅要求非空字符串） */
export const passwordSchema = z.object({
	password: z.string().min(1).max(256),
});

/** 认证状态查询入参（携带客户端现有 token，用于判定 authenticated） */
export const authStatusSchema = z.object({
	token: z.string().optional().nullable(),
});
