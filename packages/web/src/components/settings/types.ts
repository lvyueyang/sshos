/**
 * 系统设置（模型配置）客户端类型：与服务端 ai-config 返回值对齐，
 * 供模型设置面板与 Provider 抽屉共用。
 */

/** provider 汇总行（Provider 表渲染） */
export interface AiProviderSummary {
	id: string;
	name: string;
	/** 内置 provider（KnownProvider 集合内）；false = 纯自定义 */
	isBuiltin: boolean;
	/** 用户在 models.json 有声明（自定义或覆盖内置） */
	declared: boolean;
	/** 已配置凭据 */
	configured: boolean;
	modelCount: number;
	baseUrl?: string;
	api?: string;
	/** 用户在 models.json 声明的完整配置（编辑抽屉预填；仅 declared 时存在） */
	config?: {
		baseUrl: string;
		api: string;
		compat?: CompatConfig;
		models?: Array<{
			id: string;
			name?: string;
			reasoning?: boolean;
			contextWindow?: number;
			maxTokens?: number;
		}>;
	};
}

/** AI 配置汇总 */
export interface AiConfigSummary {
	providers: AiProviderSummary[];
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: string;
}

/** 模型行（默认模型下拉 / 模型列表） */
export interface AiModelSummary {
	id: string;
	name: string;
	provider: string;
	reasoning: boolean;
	contextWindow: number;
	maxTokens: number;
	input: string[];
	/** 是否有有效凭据（模型是否可用） */
	available: boolean;
}

/** 兼容选项（models.json compat 的 UI 可配置位） */
export interface CompatConfig {
	supportsDeveloperRole?: boolean;
	supportsReasoningEffort?: boolean;
	supportsStrictTools?: boolean;
}

/** 自定义模型编辑行（Provider 抽屉 models 子表） */
export interface CustomModelDraft {
	id: string;
	name?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}
