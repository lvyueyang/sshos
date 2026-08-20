/**
 * 策略引擎 SFn 中间件（docs 技术架构 §7.4）：
 * 工厂提供 command（shell 文本分类）与 file（SFTP 路径分类）两种 kind，
 * block 直接中断，review 登记挂起抛 ApprovalRequiredError，safe 放行。
 */

import {
	classifyCommand,
	classifyFileOperation,
	type Verdict,
} from "@sshos/policy";
import { createMiddleware } from "@tanstack/react-start";
import { resolveIsProduction } from "#/services/ssh/ssh.server";
import {
	ApprovalRequiredError,
	approvalRegistry,
	PolicyError,
} from "../approval/registry";

type PolicyKind = "command" | "file";

/** 从 SFn 入参提取 sessionId（写操作类 SFn 的 data 均含该字段） */
function extractSessionId(data: unknown): string | undefined {
	if (data && typeof data === "object" && "sessionId" in data) {
		return String((data as { sessionId?: unknown }).sessionId ?? "");
	}
	return undefined;
}

/** 分类并处理判定结果：block 抛错 / review 挂起 / safe 放行 */
function createPolicyMiddleware(kind: PolicyKind) {
	return createMiddleware({ type: "function" }).server(
		async ({ next, data, context }) => {
			const sessionId = extractSessionId(data);
			// isProduction 由 server 按会话查询，客户端不可信，不通过 sendContext 传入
			const isProduction = await resolveIsProduction(sessionId);

			const verdict: Verdict =
				kind === "file"
					? classifyFileOperation(data, { isProduction })
					: classifyCommand(data, { isProduction });

			// 共享中间件上下文（可变引用）：audit 外层据此记录 classification
			(context as unknown as { verdict?: Verdict }).verdict = verdict;

			if (verdict.level === "block") {
				throw new PolicyError(verdict);
			}
			if (verdict.level === "review") {
				const requestId = approvalRegistry.register({
					fnName: kind === "file" ? "sftpPolicy" : "policyEngine",
					data,
					sessionId,
					reason: verdict.reason,
					// approved 后重放：从挂起点继续下游链（跳过本判定，已人工确认）
					replay: () => next(),
				});
				throw new ApprovalRequiredError(requestId, verdict.reason);
			}
			return next();
		},
	);
}

/** 命令执行：execCommandSFn（shell 文本分类） */
export const policyEngineMiddleware = createPolicyMiddleware("command");
/** SFTP 变更写操作：sftpDeleteSFn / sftpRenameSFn（路径分类） */
export const sftpPolicyMiddleware = createPolicyMiddleware("file");
