/**
 * ai-config 服务 SFn（模型配置 / 系统设置 UI 的读写入口）：
 * 汇总查询 / 模型枚举为 GET；凭据与自定义 provider / 默认模型为 POST 写操作。
 * 服务端依赖（ModelRuntime / SettingsManager）经动态 import 隔离，不进 client bundle。
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/middleware/auth-guard";
import {
	clearApiKeySchema,
	deleteCustomProviderSchema,
	getAiConfigSchema,
	listModelsSchema,
	saveApiKeySchema,
	saveCustomProviderSchema,
	setDefaultModelSchema,
} from "./ai-config.schemas";

/** AI 配置汇总：providers + 鉴权状态 + 默认模型（模型页数据源） */
export const getAiConfigSFn = createServerFn({ method: "GET" })
	.validator(getAiConfigSchema)
	.middleware([authMiddleware])
	.handler(async () => {
		const { getAiConfigSummary } = await import("./ai-config.server");
		return getAiConfigSummary();
	});

/** 枚举模型（默认模型下拉 / 模型列表；provider 可选） */
export const listModelsSFn = createServerFn({ method: "GET" })
	.validator(listModelsSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const { listModels } = await import("./ai-config.server");
		return listModels(data.provider);
	});

/** 保存 provider API key（明文入库 + 注入运行时） */
export const saveApiKeySFn = createServerFn({ method: "POST" })
	.validator(saveApiKeySchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const { saveApiKey } = await import("./ai-config.server");
		await saveApiKey(data.provider, data.apiKey);
		return { ok: true };
	});

/** 清除 provider API key */
export const clearApiKeySFn = createServerFn({ method: "POST" })
	.validator(clearApiKeySchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const { clearApiKey } = await import("./ai-config.server");
		await clearApiKey(data.provider);
		return { ok: true };
	});

/** 新增 / 更新自定义 provider（models.json 写操作，随后重建运行时单例） */
export const saveCustomProviderSFn = createServerFn({ method: "POST" })
	.validator(saveCustomProviderSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const { saveCustomProvider } = await import("./ai-config.server");
		await saveCustomProvider(data.provider);
		return { ok: true };
	});

/** 删除自定义 provider（models.json 写操作） */
export const deleteCustomProviderSFn = createServerFn({ method: "POST" })
	.validator(deleteCustomProviderSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const { deleteCustomProvider } = await import("./ai-config.server");
		await deleteCustomProvider(data.providerId);
		return { ok: true };
	});

/** 设置默认 provider / model / thinking 级别（settings.json 写操作） */
export const setDefaultModelSFn = createServerFn({ method: "POST" })
	.validator(setDefaultModelSchema)
	.middleware([authMiddleware])
	.handler(async ({ data }) => {
		const { setDefaultModel } = await import("./ai-config.server");
		await setDefaultModel(data);
		return { ok: true };
	});
