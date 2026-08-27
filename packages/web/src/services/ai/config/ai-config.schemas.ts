/**
 * ai-config 服务 SFn 入参出参 Zod schema（单一来源，服务层用 z.infer 派生）。
 * 枚举与字段对齐 pi SDK 的 models.json / settings.json（docs 技术架构 §8 扩展）。
 * 自定义 provider 只写非敏感字段，API key 走独立 saveApiKeySFn（加密入库）。
 */

import { z } from "zod";

/** pi 支持的四种 API 协议类型（models.json 的 api 字段） */
export const apiTypeSchema = z.enum([
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
]);

/** 兼容选项（models.json 的 compat；本地模型 / 代理后端常用） */
export const providerCompatSchema = z.object({
	/** OpenAI 兼容服务不支持 developer 角色时设 false（系统提示走 system 消息） */
	supportsDeveloperRole: z.boolean().optional(),
	/** 服务端不支持 reasoning_effort 时设 false */
	supportsReasoningEffort: z.boolean().optional(),
	/** Anthropic 兼容后端接受严格 JSON schema 工具定义时设 true */
	supportsStrictTools: z.boolean().optional(),
});

/** 自定义模型（models.json models 数组元素） */
export const customModelSchema = z.object({
	id: z.string().min(1).max(128),
	name: z.string().max(256).optional(),
	reasoning: z.boolean().optional(),
	input: z.array(z.enum(["text", "image"])).optional(),
	contextWindow: z.number().int().positive().optional(),
	maxTokens: z.number().int().positive().optional(),
});

/** 自定义 / 覆盖 provider（models.json providers[<id>]；不含 apiKey 等敏感字段） */
export const customProviderInputSchema = z.object({
	/** provider 唯一标识（自定义建议小写连字符命名） */
	id: z
		.string()
		.min(1)
		.max(128)
		.regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, "provider id 仅允许字母数字与连字符"),
	baseUrl: z.string().url(),
	api: apiTypeSchema,
	compat: providerCompatSchema.optional(),
	models: z.array(customModelSchema).max(200).optional(),
});

/** 保存 provider API key（敏感，加密入库） */
export const saveApiKeySchema = z.object({
	provider: z.string().min(1).max(128),
	apiKey: z.string().min(1).max(2048),
});

/** 清除 provider API key */
export const clearApiKeySchema = z.object({
	provider: z.string().min(1).max(128),
});

/** 新增 / 更新自定义 provider（models.json 写操作） */
export const saveCustomProviderSchema = z.object({
	provider: customProviderInputSchema,
});

/** 删除自定义 provider（models.json 写操作） */
export const deleteCustomProviderSchema = z.object({
	providerId: z.string().min(1).max(128),
});

/** pi thinking 级别（settings.json defaultThinkingLevel） */
export const thinkingLevelSchema = z.enum([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

/** 设置默认模型（settings.json 写操作；全部字段可选，缺省不动原值） */
export const setDefaultModelSchema = z.object({
	defaultProvider: z.string().min(1).max(128).optional(),
	defaultModel: z.string().min(1).max(256).optional(),
	defaultThinkingLevel: thinkingLevelSchema.optional(),
});

/** 模型列表查询（provider 可选，缺省列出全部已配置凭据的模型） */
export const listModelsSchema = z.object({
	provider: z.string().min(1).max(128).optional(),
});

/** AI 配置汇总查询（GET，无入参） */
export const getAiConfigSchema = z.object({});

/** 输出类型 */
export type CustomProviderInput = z.infer<typeof customProviderInputSchema>;
export type SetDefaultModelInput = z.infer<typeof setDefaultModelSchema>;
