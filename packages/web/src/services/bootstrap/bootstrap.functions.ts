/**
 * 初始化状态 SFn（登录前可访问的公开接口）：
 * bootstrapStatusSFn 返回初始化阶段（running / ready），供前端渲染载入界面。
 */

import { createServerFn } from "@tanstack/react-start";
import { registerPublicSfn } from "#/lib/public-sfns/public-sfns";
import { getBootstrapStatus } from "./status";

export const bootstrapStatusSFn = createServerFn({ method: "GET" }).handler(
	async () => getBootstrapStatus(),
);
registerPublicSfn(bootstrapStatusSFn.url);
