/**
 * 日志展示格式化工具（日志应用与 AI 审计历史面板共用）：
 * 类型 / 动作 / 级别色标 / 耗时 / 时间 / 命令截断的中文映射与格式化。
 * 纯渲染层工具，不依赖服务端模块。
 */

/** log 表 type → 中文标签 */
export const TYPE_LABEL: Record<string, string> = {
	ai_audit: "AI 审计",
	terminal_command: "终端命令",
	policy_decision: "策略决策",
};

/** type → 徽标色（三类日志可辨识） */
export const TYPE_COLOR: Record<string, string> = {
	ai_audit: "var(--accent2)",
	terminal_command: "var(--ok)",
	policy_decision: "var(--warn)",
};

/** action → 中文展示（与 db log 表 action 枚举一致） */
export const ACTION_LABEL: Record<string, string> = {
	executed: "已执行",
	blocked: "已拦截",
	pending_approval: "待审批",
	approved: "已批准",
	rejected: "已拒绝",
	user_input: "用户输入",
};

/** classification → 色标圆点（safe 绿 / review 黄 / block 红，其余灰） */
export const LEVEL_COLOR: Record<string, string> = {
	safe: "var(--ok)",
	review: "var(--warn)",
	block: "var(--danger)",
};

/** 从 detail JSON 提取耗时（如 "0.3s"），缺省返回空串 */
export function formatDuration(detail: string | null | undefined): string {
	if (!detail) return "";
	try {
		const parsed = JSON.parse(detail) as { durationMs?: number };
		if (typeof parsed.durationMs !== "number") return "";
		const sec = parsed.durationMs / 1000;
		return sec < 1 ? `${(sec * 1000).toFixed(0)}ms` : `${sec.toFixed(1)}s`;
	} catch {
		return "";
	}
}

/** 时间 → HH:MM:SS（本地时区，精确到秒） */
export function formatTime(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => `${n}`.padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 完整时间 → YYYY-MM-DD HH:MM:SS */
export function formatFullTime(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => `${n}`.padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatTime(iso)}`;
}

/** 截断命令：超出 max 字符加省略号 */
export function truncateCommand(command: string, max = 40): string {
	return command.length > max ? `${command.slice(0, max)}…` : command;
}
