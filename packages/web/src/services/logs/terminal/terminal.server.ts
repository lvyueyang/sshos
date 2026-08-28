/** 终端交互日志服务：校验会话归属后记录用户手动输入。 */

import { auditLogWriter } from "#/services/logs/audit/audit-writer.server";
import { sshManager } from "#/services/ssh/connection/ssh.server";

/** 记录终端交互命令（terminal_command 类；会话不存在时丢弃，防伪造 sessionId 污染审计） */
export function recordTerminalCommand(
	sessionId: string,
	command: string,
): void {
	let connectionId: number;
	try {
		connectionId = sshManager.get(sessionId).connectionId;
	} catch {
		// 会话不存在 / 已断开：丢弃记录（客户端侧已无法归属真实会话）
		return;
	}
	auditLogWriter.enqueue({
		type: "terminal_command",
		sessionId,
		connectionId,
		command,
		action: "user_input",
		result: "success",
	});
}
