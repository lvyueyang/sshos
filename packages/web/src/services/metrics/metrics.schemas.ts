/**
 * 系统指标流入参校验（Zod 单一来源）
 */

import { z } from "zod";

/** 订阅指定会话的指标快照流 */
export const metricsStreamSchema = z.object({
	sessionId: z.string().min(1),
});
