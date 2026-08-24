/**
 * 命令执行服务（AI 工具、execCommandSFn、安装引导共用，docs 技术架构 §7）：
 * 策略检查（classifyCommand）→ 审计 → block 抛错 / review 登记审批并抛
 * ApprovalRequiredError / safe 执行。AI 工具与安装引导在此直接调用，绕过 SFn
 * 服务端调用（execCommandSFn 未在 server manifest 注册时，服务端调用 SFn 会 fnId 查找失败）。
 */

import { classifyCommand } from "@sshos/policy";
import {
	ApprovalRequiredError,
	approvalRegistry,
	PolicyError,
} from "#/approval/registry";
import {
	batchWriter,
	type LogAction,
	type LogResult,
} from "#/lib/batch-writer";
import { execCommand, resolveIsProduction } from "#/services/ssh/ssh.server";

/** 直接执行 SSH 命令（不做策略检查，供审批重放与 safe 分支使用） */
export async function execDirect(
	sessionId: string,
	command: string,
): Promise<string> {
	return execCommand(sessionId, command);
}

/** 执行命令并写入策略审计（block/review/safe 全记录） */
function writeAudit(
	sessionId: string,
	command: string,
	classification: "safe" | "review" | "block",
	action: LogAction,
	result: LogResult,
	detail?: string,
): void {
	batchWriter.enqueue({
		type: "policy_decision",
		sessionId,
		command,
		classification,
		action,
		result,
		detail,
	});
}

/** 带策略引擎的命令执行：分类 → 审计 → block/review/safe 三分支 */
export async function execWithPolicy(
	sessionId: string,
	command: string,
): Promise<string> {
	const isProduction = await resolveIsProduction(sessionId);
	const verdict = classifyCommand({ command }, { isProduction });

	if (verdict.level === "block") {
		writeAudit(
			sessionId,
			command,
			"block",
			"blocked",
			"failure",
			verdict.reason,
		);
		throw new PolicyError(verdict);
	}
	if (verdict.level === "review") {
		writeAudit(
			sessionId,
			command,
			"review",
			"pending_approval",
			"failure",
			verdict.reason,
		);
		const requestId = approvalRegistry.register({
			fnName: "execCommand",
			data: { sessionId, command },
			sessionId,
			reason: verdict.reason,
			// 批准后重放：直接执行，不再过策略（已人工确认）
			replay: () => execDirect(sessionId, command),
		});
		throw new ApprovalRequiredError(requestId, verdict.reason);
	}

	const stdout = await execDirect(sessionId, command);
	writeAudit(sessionId, command, "safe", "executed", "success");
	return stdout;
}
