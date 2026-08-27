/**
 * Prompt 注入检测中间件（docs 技术架构 §7.9）：只挂 aiChatSFn。
 * 与命令分类（Policy Engine）分离——系统提示词隔离 + 对话/指令分层 + 输出后命令再分类。
 * 纵深防御：即使注入绕过本层，模型产出的命令在 execCommandSFn 仍会被策略引擎再分类拦截。
 */

import { createMiddleware } from "@tanstack/react-start";

/** 常见注入模式：忽略指令 / 越权扮演 / 提示词泄露尝试 */
const INJECTION_PATTERNS = [
	/忽略(之前|以上|所有).*(指令|要求|规则)/i,
	/ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts)/i,
	/you\s+are\s+now\s+/i,
	/(disregard|forget)\s+(your\s+)?(instructions|system)/i,
	/输出\s*(你的|你的.*)?(系统提示词|system\s*prompt)/i,
	/(reveal|show)\s+(your\s+)?system\s*prompt/i,
];

/** 用户消息注入检测：命中模式直接拒绝本轮对话 */
function hasInjection(text: string): boolean {
	return INJECTION_PATTERNS.some((re) => re.test(text));
}

/** aiChatSFn 入参的宽松形态（中间件只读，不做全量校验） */
type ChatPayload = {
	messages?: Array<{ role?: string; content?: string }>;
};

/** 校验对话入参（system 角色 / 注入模式），异常抛错拒绝；供中间件与 AI Server Route 共用 */
export function guardChatInput(
	messages: Array<{ role?: string; content?: string }>,
): void {
	if (messages.some((m) => m.role === "system")) {
		throw new Error("system 角色不允许由客户端传入");
	}
	// 注入模式检测（只扫用户消息，assistant 历史为模型产出不在此拦截）
	const userText = messages
		.filter((m) => m.role === "user")
		.map((m) => m.content ?? "")
		.join("\n");
	if (hasInjection(userText)) {
		throw new Error("检测到疑似提示词注入，已拒绝本轮请求");
	}
}

export const promptGuardMiddleware = createMiddleware({
	type: "function",
}).server(async ({ next, data }) => {
	guardChatInput((data as unknown as ChatPayload).messages ?? []);
	return next();
});
