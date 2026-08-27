/**
 * AI 模型配置领域服务（docs 技术架构 §8 扩展，本期「模型配置 + 系统设置 UI」服务端）：
 * 以 pi 运行时文件为单一事实来源——models.json（provider 目录）/ settings.json（默认模型），
 * 凭据明文存 setting 表（决策记录 D23）后经 ModelRuntime.setRuntimeApiKey 注入内存。
 * ModelRuntime 为进程内单例，Pi Host（ai/pi-agent.ts）复用同一实例消费配置。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import { getDataDir } from "#/lib/paths";
import {
	deleteSetting,
	getSetting,
	setSetting,
} from "#/services/settings/connections/settings.server";
import type {
	CustomProviderInput,
	SetDefaultModelInput,
} from "./ai-config.schemas";

/** pi 内置 provider 标识集（KnownProvider 联合类型，运行时无数组导出，硬编码常量） */
export const BUILTIN_PROVIDERS = new Set([
	"amazon-bedrock",
	"ant-ling",
	"anthropic",
	"google",
	"google-vertex",
	"openai",
	"azure-openai-responses",
	"openai-codex",
	"radius",
	"nvidia",
	"deepseek",
	"github-copilot",
	"xai",
	"groq",
	"cerebras",
	"openrouter",
	"vercel-ai-gateway",
	"zai",
	"zai-coding-cn",
	"mistral",
	"minimax",
	"minimax-cn",
	"moonshotai",
	"moonshotai-cn",
	"huggingface",
	"fireworks",
	"together",
	"baseten",
	"opencode",
	"opencode-go",
	"kimi-coding",
	"cloudflare-workers-ai",
	"cloudflare-ai-gateway",
	"qwen-token-plan",
	"qwen-token-plan-cn",
	"qwen-token-plan-individual",
	"xiaomi",
	"xiaomi-token-plan-cn",
	"xiaomi-token-plan-ams",
	"xiaomi-token-plan-sgp",
]);

/** 项目自有 pi 运行时根（与用户 ~/.pi 完全隔离，docs 决策 D-A 草案） */
export function getPiAgentDir(): string {
	return join(getDataDir(), "pi", "agent");
}

/** models.json 完整路径（provider 目录，UI 增改自定义 provider 的落点） */
export function getModelsConfigPath(): string {
	return join(getPiAgentDir(), "models.json");
}

/** settings.json 完整路径（默认 provider / model / thinking 的落点） */
export function getSettingsConfigPath(): string {
	return join(getPiAgentDir(), "settings.json");
}

/** 凭据存储 key：setting 表 ai.credential.<provider>，值为明文 API key */
function credentialKey(provider: string): string {
	return `ai.credential.${provider}`;
}

/** 保存 provider API key（明文入库，不落盘到运行时文件） */
export async function saveApiKey(
	provider: string,
	apiKey: string,
): Promise<void> {
	await setSetting(credentialKey(provider), apiKey);
	// 注入到运行时单例（若已创建），后续请求立即可用
	const runtime = runtimePromise ? await runtimePromise : null;
	if (runtime) await runtime.setRuntimeApiKey(provider, apiKey);
}

/** 清除 provider API key（setting 表与运行时内存一并移除） */
export async function clearApiKey(provider: string): Promise<void> {
	await deleteSetting(credentialKey(provider));
	const runtime = runtimePromise ? await runtimePromise : null;
	if (runtime) await runtime.removeRuntimeApiKey(provider);
}

/** 读取已存储的全部 API key 并注入运行时（服务重启后恢复） */
async function loadStoredApiKeys(runtime: ModelRuntime): Promise<void> {
	// setting 表无按前缀扫描接口，扫描内置 + 自定义 provider 的凭据键
	const providers = new Set<string>(BUILTIN_PROVIDERS);
	for (const id of Object.keys(readModelsConfig().providers ?? {})) {
		providers.add(id);
	}
	for (const provider of providers) {
		const key = await getSetting<string>(credentialKey(provider));
		if (!key) continue;
		try {
			await runtime.setRuntimeApiKey(provider, key);
		} catch {
			// 单条凭据失效不阻断整体恢复，留待用户重新配置
		}
	}
}

/** 进程内 ModelRuntime 单例（lazy 创建，避免服务启动即做模型目录解析） */
let runtimePromise: Promise<ModelRuntime> | null = null;

/** 获取（或创建）全局 ModelRuntime 单例，按项目 models.json + 明文凭据初始化 */
export function getModelRuntime(): Promise<ModelRuntime> {
	if (!runtimePromise) {
		runtimePromise = (async () => {
			mkdirSync(getPiAgentDir(), { recursive: true });
			const runtime = await ModelRuntime.create({
				authPath: join(getPiAgentDir(), "auth.json"),
				modelsPath: getModelsConfigPath(),
				// 静态内置目录已内置，不联网刷新动态目录（自定义 provider 由 models.json 提供）
				allowModelNetwork: false,
			});
			await loadStoredApiKeys(runtime);
			return runtime;
		})();
	}
	return runtimePromise;
}

/** 使 ModelRuntime 单例失效（models.json 变更后重建，保证与新文件一致） */
export function invalidateModelRuntime(): void {
	runtimePromise = null;
}

/** 项目 settingsManager 单例（读 / 写 settings.json 的默认模型配置） */
let settingsManager: SettingsManager | null = null;

/** 获取全局 SettingsManager（agentDir = 项目 pi 目录，与用户 ~/.pi 隔离） */
export function getSettingsManager(): SettingsManager {
	if (!settingsManager) {
		// cwd 传数据目录，避免向上发现仓库 / 用户目录的 .pi/settings.json 项目级覆盖
		settingsManager = SettingsManager.create(getDataDir(), getPiAgentDir());
	}
	return settingsManager;
}

/** 模型类型（从 ModelRuntime 派生，避免直接依赖 pi-ai 子包） */
type PiModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

/** models.json 兼容选项（跨 SFn 序列化边界，仅暴露 UI 可配置的三个布尔位） */
export interface CompatConfig {
	supportsDeveloperRole?: boolean;
	supportsReasoningEffort?: boolean;
	supportsStrictTools?: boolean;
}

/* ---------------- models.json 读写（自定义 provider 管理） ---------------- */

/** models.json 顶层结构（providers 为 id → provider 配置） */
export interface ModelsFile {
	providers?: Record<
		string,
		{
			baseUrl?: string;
			api?: string;
			compat?: Record<string, unknown>;
			headers?: Record<string, string>;
			models?: Array<Record<string, unknown>>;
			modelOverrides?: Record<string, unknown>;
		}
	>;
}

/** 读取 models.json（不存在返回空结构；解析失败抛错） */
export function readModelsConfig(): ModelsFile {
	const file = getModelsConfigPath();
	if (!existsSync(file)) return {};
	try {
		const raw = JSON.parse(readFileSync(file, "utf-8")) as ModelsFile;
		return raw.providers ? raw : {};
	} catch (err) {
		throw new Error(`models.json 解析失败: ${String(err)}`);
	}
}

/** 进程内写锁（单进程 web server 唯一写者，异步互斥足够） */
let modelsWriteLock: Promise<void> = Promise.resolve();

/** 原子写入 models.json（写锁串行化 + 0600 权限） */
export function writeModelsConfig(config: ModelsFile): Promise<void> {
	const task = modelsWriteLock.then(async () => {
		mkdirSync(getPiAgentDir(), { recursive: true });
		writeFileSync(getModelsConfigPath(), JSON.stringify(config, null, 2), {
			mode: 0o600,
		});
	});
	// 让下一个任务等待本次完成；写入失败也不阻塞后续（链式续上）
	modelsWriteLock = task.catch(() => undefined);
	return task;
}

/** 新增 / 更新自定义 provider（保留既有配置；同名内置 provider 视为覆盖） */
export async function saveCustomProvider(
	input: CustomProviderInput,
): Promise<void> {
	const config = readModelsConfig();
	const providers = config.providers ?? {};
	providers[input.id] = {
		baseUrl: input.baseUrl,
		api: input.api,
		...(input.compat ? { compat: input.compat } : {}),
		...(input.models && input.models.length > 0
			? { models: input.models }
			: {}),
	};
	config.providers = providers;
	await writeModelsConfig(config);
	invalidateModelRuntime();
}

/** 删除自定义 provider（内置 provider 配置一并移除，恢复 pi 默认） */
export async function deleteCustomProvider(providerId: string): Promise<void> {
	const config = readModelsConfig();
	if (!config.providers?.[providerId]) return;
	delete config.providers[providerId];
	await writeModelsConfig(config);
	invalidateModelRuntime();
}

/** 读取 models.json 中用户声明的 provider 配置（id → 配置） */
export function readDeclaredProviders(): Record<
	string,
	{ baseUrl?: string; api?: string; models?: Array<Record<string, unknown>> }
> {
	return (readModelsConfig().providers ?? {}) as Record<
		string,
		{ baseUrl?: string; api?: string; models?: Array<Record<string, unknown>> }
	>;
}

/* ---------------- settings.json 读写（默认模型） ---------------- */

/** 设置默认模型（settings.json，pi SettingsManager 写入并 flush） */
export async function setDefaultModel(
	input: SetDefaultModelInput,
): Promise<void> {
	const sm = getSettingsManager();
	if (input.defaultProvider && input.defaultModel) {
		sm.setDefaultModelAndProvider(input.defaultProvider, input.defaultModel);
	} else if (input.defaultProvider) {
		sm.setDefaultProvider(input.defaultProvider);
	} else if (input.defaultModel) {
		sm.setDefaultModel(input.defaultModel);
	}
	if (input.defaultThinkingLevel) {
		sm.setDefaultThinkingLevel(input.defaultThinkingLevel);
	}
	await sm.flush();
}

/** 当前默认模型配置（settings.json 生效值） */
export function getDefaultModelConfig(): {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: string;
} {
	const sm = getSettingsManager();
	return {
		defaultProvider: sm.getDefaultProvider(),
		defaultModel: sm.getDefaultModel(),
		defaultThinkingLevel: sm.getDefaultThinkingLevel(),
	};
}

/* ---------------- 枚举（供 UI 渲染） ---------------- */

/** provider 汇总行（Provider 表渲染） */
export interface AiProviderSummary {
	id: string;
	name: string;
	/** 内置 provider（KnownProvider 集合内）；false = 纯自定义 */
	isBuiltin: boolean;
	/** 用户在 models.json 有声明（自定义或覆盖内置） */
	declared: boolean;
	/** 已配置凭据（apiKey 或 OAuth 就绪） */
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

/** AI 配置汇总（模型页顶部卡 + Provider 表数据源） */
export interface AiConfigSummary {
	providers: AiProviderSummary[];
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: string;
}

/** 枚举全部 provider 及鉴权 / 声明状态 */
export async function getAiConfigSummary(): Promise<AiConfigSummary> {
	const runtime = await getModelRuntime();
	const declared = readDeclaredProviders();
	const providers: AiProviderSummary[] = runtime
		.getProviders()
		.map((p) => {
			const decl = declared[p.id];
			return {
				id: p.id,
				name: p.name,
				isBuiltin: BUILTIN_PROVIDERS.has(p.id),
				declared: Boolean(decl),
				configured: runtime.hasConfiguredAuth(p.id),
				modelCount: runtime.getModels(p.id).length,
				baseUrl: p.baseUrl,
				api: (decl?.api ?? p.getModels()[0]?.api) as string | undefined,
				...(decl ? { config: declToConfig(decl) } : {}),
			};
		})
		.sort((a, b) => {
			// 自定义 provider 优先，其次按名称
			if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? 1 : -1;
			return a.name.localeCompare(b.name);
		});
	return { providers, ...getDefaultModelConfig() };
}

/** 自定义 provider models.json 配置 → 编辑抽屉预填形态 */
function declToConfig(decl: {
	baseUrl?: string;
	api?: string;
	compat?: Record<string, unknown>;
	models?: Array<Record<string, unknown>>;
}): NonNullable<AiProviderSummary["config"]> {
	const c = decl.compat;
	return {
		baseUrl: decl.baseUrl ?? "",
		api: decl.api ?? "openai-completions",
		compat: {
			supportsDeveloperRole: Boolean(c?.supportsDeveloperRole),
			supportsReasoningEffort: Boolean(c?.supportsReasoningEffort),
			supportsStrictTools: Boolean(c?.supportsStrictTools),
		},
		...(decl.models
			? {
					models: decl.models.map((m) => ({
						id: String(m.id ?? ""),
						name: typeof m.name === "string" ? m.name : undefined,
						reasoning:
							typeof m.reasoning === "boolean" ? m.reasoning : undefined,
						contextWindow:
							typeof m.contextWindow === "number" ? m.contextWindow : undefined,
						maxTokens:
							typeof m.maxTokens === "number" ? m.maxTokens : undefined,
					})),
				}
			: {}),
	};
}

/** 模型行（模型列表 / 默认模型下拉） */
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

/** 枚举某 provider 的模型（缺省列全部 provider） */
export async function listModels(provider?: string): Promise<AiModelSummary[]> {
	const runtime = await getModelRuntime();
	const availableIds = new Set(
		runtime.getAvailableSnapshot().map((m) => `${m.provider}:${m.id}`),
	);
	const pick = (m: PiModel): AiModelSummary => ({
		id: m.id,
		name: m.name,
		provider: m.provider,
		reasoning: m.reasoning,
		contextWindow: m.contextWindow,
		maxTokens: m.maxTokens,
		input: [...m.input],
		available: availableIds.has(`${m.provider}:${m.id}`),
	});
	if (provider) {
		return runtime.getModels(provider).map(pick);
	}
	return runtime
		.getProviders()
		.flatMap((p) => runtime.getModels(p.id).map(pick));
}

/** 解析配置的默认模型（供 Pi Host / createAgentSession 消费本项目配置） */
export async function resolveConfiguredModel(): Promise<{
	modelRuntime: ModelRuntime;
	settingsManager: SettingsManager;
	model: PiModel | undefined;
	agentDir: string;
	cwd: string;
}> {
	const modelRuntime = await getModelRuntime();
	const sm = getSettingsManager();
	const provider = sm.getDefaultProvider();
	const modelId = sm.getDefaultModel();
	const model =
		provider && modelId ? modelRuntime.getModel(provider, modelId) : undefined;
	return {
		modelRuntime,
		settingsManager: sm,
		model,
		agentDir: getPiAgentDir(),
		cwd: getDataDir(),
	};
}
