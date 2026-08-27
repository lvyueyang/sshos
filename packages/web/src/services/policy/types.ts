/**
 * 策略引擎核心类型：命令 / 文件操作分类的三级模型（决策记录 D3）
 */

/** 三级分类：全链路（策略引擎 → UI 状态色 → 数据库 log.classification）命名一致 */
export type Level = "safe" | "review" | "block";

/** 规则：正则模式 + 级别 + 说明 */
export interface Rule {
	pattern: RegExp;
	level: Level;
	/** 规则说明，作为拦截 / 审批的原因展示给用户 */
	description: string;
}

/** 分类判定结果 */
export interface Verdict {
	level: Level;
	reason: string;
}
