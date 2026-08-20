/**
 * @sshos/policy 统一出口：命令 / 文件操作分类器与规则集
 */

export { classifyCommand, classifyFileOperation } from "./classifier";
export {
	basePathRules,
	baseRules,
	getPathRules,
	getRules,
	productionPathRules,
	productionRules,
} from "./rules";
export type { Level, Rule, Verdict } from "./types";
