/**
 * ai-config 模型配置服务层单元测试：
 * 临时数据目录 + 程序化迁移，覆盖 models.json 读写、凭据明文注入、
 * settings.json 默认模型、汇总与枚举、resolveConfiguredModel 解析。
 * 真实 ModelRuntime 走静态内置目录（不联网），验证项目运行时与用户 ~/.pi 隔离。
 */

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../../db/migrate";
import { getSetting } from "../../settings/connections/settings.server";
import * as aiConfig from "../config/ai-config.server";

const dataDir = mkdtempSync(join(tmpdir(), "sshos-ai-config-"));
process.env.SSHOS_DATA_DIR = dataDir;

beforeAll(async () => {
	await runMigrations();
});

/** 重置模块级单例（测试间隔离 models.json / settings.json 变化） */
async function resetSingletons(): Promise<void> {
	aiConfig.invalidateModelRuntime();
	await aiConfig.getModelRuntime(); // 预热，保证后续 getModelRuntime 复用同一实例
}

describe("models.json 自定义 provider 读写", () => {
	it("保存自定义 provider：写文件且不含敏感字段", async () => {
		await resetSingletons();
		await aiConfig.saveCustomProvider({
			id: "local-ollama",
			baseUrl: "http://localhost:11434/v1",
			api: "openai-completions",
			models: [{ id: "qwen2.5-coder:7b" }],
		});

		const file = aiConfig.getModelsConfigPath();
		expect(existsSync(file)).toBe(true);
		const raw = readFileSync(file, "utf-8");
		expect(raw).not.toContain("apiKey"); // 不落明文 key
		const parsed = JSON.parse(raw) as {
			providers: Record<string, { baseUrl: string; api: string; models: [] }>;
		};
		expect(parsed.providers["local-ollama"].baseUrl).toBe(
			"http://localhost:11434/v1",
		);
		expect(parsed.providers["local-ollama"].models).toHaveLength(1);

		// 运行时能枚举到该自定义 provider 与其模型
		const runtime = await aiConfig.getModelRuntime();
		expect(runtime.getProvider("local-ollama")).toBeDefined();
		expect(runtime.getModels("local-ollama").map((m) => m.id)).toEqual([
			"qwen2.5-coder:7b",
		]);
	});

	it("删除自定义 provider：models.json 配置移除、运行时重建后不再出现", async () => {
		await aiConfig.deleteCustomProvider("local-ollama");
		await resetSingletons();
		const runtime = await aiConfig.getModelRuntime();
		expect(runtime.getProvider("local-ollama")).toBeUndefined();
		const file = aiConfig.getModelsConfigPath();
		const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
			providers: Record<string, unknown>;
		};
		expect(parsed.providers["local-ollama"]).toBeUndefined();
	});
});

describe("凭据明文存储", () => {
	it("saveApiKey：明文入库，注入后 hasConfiguredAuth 为 true", async () => {
		await resetSingletons();
		const key = "sk-ant-very-secret";
		await aiConfig.saveApiKey("anthropic", key);

		const stored = await getSetting<string>("ai.credential.anthropic");
		expect(stored).toBe(key);

		const runtime = await aiConfig.getModelRuntime();
		expect(runtime.hasConfiguredAuth("anthropic")).toBe(true);
	});

	it("clearApiKey：明文存储与运行时一并清除", async () => {
		await aiConfig.clearApiKey("anthropic");
		expect(await getSetting<string>("ai.credential.anthropic")).toBeUndefined();
		const runtime = await aiConfig.getModelRuntime();
		expect(runtime.hasConfiguredAuth("anthropic")).toBe(false);
	});
});

describe("settings.json 默认模型", () => {
	it("setDefaultModel 写入 settings.json（pi SettingsManager 格式）", async () => {
		await aiConfig.setDefaultModel({
			defaultProvider: "deepseek",
			defaultModel: "deepseek-v4-flash",
			defaultThinkingLevel: "medium",
		});
		const defaults = aiConfig.getDefaultModelConfig();
		expect(defaults).toMatchObject({
			defaultProvider: "deepseek",
			defaultModel: "deepseek-v4-flash",
			defaultThinkingLevel: "medium",
		});
		// 落盘验证（单一事实来源）
		const file = aiConfig.getSettingsConfigPath();
		expect(existsSync(file)).toBe(true);
		const parsed = JSON.parse(readFileSync(file, "utf-8")) as Record<
			string,
			string
		>;
		expect(parsed.defaultModel).toBe("deepseek-v4-flash");
	});
});

describe("汇总与枚举", () => {
	it("getAiConfigSummary：含内置 provider、鉴权状态与默认模型", async () => {
		await resetSingletons();
		await aiConfig.saveApiKey("deepseek", "sk-key");
		const summary = await aiConfig.getAiConfigSummary();

		const deepseek = summary.providers.find((p) => p.id === "deepseek");
		expect(deepseek).toBeDefined();
		expect(deepseek?.isBuiltin).toBe(true);
		expect(deepseek?.configured).toBe(true);
		expect(deepseek?.modelCount).toBeGreaterThan(0);
		expect(summary.providers.length).toBeGreaterThanOrEqual(40);
		expect(summary.defaultProvider).toBe("deepseek");
	});

	it("listModels：返回可用性标记", async () => {
		const models = await aiConfig.listModels("deepseek");
		expect(models.length).toBeGreaterThan(0);
		expect(models[0]).toMatchObject({
			provider: "deepseek",
			reasoning: expect.any(Boolean),
			contextWindow: expect.any(Number),
		});
		// deepseek 已配置 key，首个模型应可用
		expect(models[0].available).toBe(true);
	});

	it("resolveConfiguredModel：解析配置的默认模型与项目路径", async () => {
		const resolved = await aiConfig.resolveConfiguredModel();
		expect(resolved.agentDir).toBe(aiConfig.getPiAgentDir());
		expect(resolved.cwd).toBe(dataDir);
		expect(resolved.settingsManager).toBeDefined();
		expect(resolved.modelRuntime).toBeDefined();
		expect(resolved.model?.id).toBe("deepseek-v4-flash");
		expect(resolved.model?.provider).toBe("deepseek");
	});
});
