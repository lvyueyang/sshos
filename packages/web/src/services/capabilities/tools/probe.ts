/**
 * 远程工具探测纯函数：探测命令生成与输出解析（不依赖 SSH 通道，可独立单测）。
 * 命令模板固定、工具名白名单校验，不接受用户任意文本。
 */

/** 远程工具探测结果 */
export interface ToolProbeResult {
	tool: string;
	available: boolean;
}

/** 工具名白名单字符集（manifest 声明的工具 id，防御性过滤防命令注入） */
const TOOL_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** 校验工具名；非法直接抛错（探测入参来自 manifest 声明，此为纵深防御） */
export function assertToolName(tool: string): void {
	if (!TOOL_NAME_RE.test(tool)) {
		throw new Error(`非法工具名: ${tool}`);
	}
}

/** 生成探测命令：for 循环逐工具输出 <tool>=1/0，一次通道往返完成全部探测 */
export function buildProbeCommand(tools: string[]): string {
	const list = tools.join(" ");
	return `for t in ${list}; do command -v "$t" >/dev/null 2>&1 && echo "$t=1" || echo "$t=0"; done`;
}

/** 解析探测输出（<tool>=1 / <tool>=0 行）为可用性映射 */
export function parseProbeOutput(
	text: string,
	tools: string[],
): Record<string, boolean> {
	const lines = new Set(
		text
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean),
	);
	const out: Record<string, boolean> = {};
	for (const tool of tools) {
		out[tool] = lines.has(`${tool}=1`);
	}
	return out;
}
