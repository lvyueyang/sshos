/**
 * Provider 配置抽屉（系统设置 → 模型页）：
 * - 内置 provider：仅管理 API Key（加密入库，不落明文）
 * - 自定义 provider：完整配置（id / baseUrl / api 类型 / 兼容选项 / 模型列表）+ API Key
 * 写操作均走 ai-config SFn（models.json / 加密凭据），无绕行路径。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	clearApiKeySFn,
	deleteCustomProviderSFn,
	saveApiKeySFn,
	saveCustomProviderSFn,
} from "#/services/ai-config/ai-config.functions";
import type {
	AiProviderSummary,
	CompatConfig,
	CustomModelDraft,
} from "./types";

const API_TYPES = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
] as const;

const COMPAT_FIELDS: Array<{
	key: keyof CompatConfig;
	label: string;
}> = [
	{ key: "supportsDeveloperRole", label: "settings.supportsDeveloperRole" },
	{ key: "supportsReasoningEffort", label: "settings.supportsReasoningEffort" },
	{ key: "supportsStrictTools", label: "settings.supportsStrictTools" },
];

interface ProviderDrawerProps {
	/** null = 新建自定义 provider；内置 / 自定义编辑传对应行 */
	provider: AiProviderSummary | null;
	onClose(): void;
	onChanged(): void;
}

export function ProviderDrawer({
	provider,
	onClose,
	onChanged,
}: ProviderDrawerProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const isBuiltin = Boolean(provider?.isBuiltin);
	const isNew = provider === null;
	const editingId = provider?.id;

	const [id, setId] = useState(provider?.id ?? "");
	const [baseUrl, setBaseUrl] = useState(provider?.config?.baseUrl ?? "");
	const [api, setApi] = useState<string>(
		provider?.config?.api ?? "openai-completions",
	);
	const [compat, setCompat] = useState<CompatConfig>(() => {
		const c = provider?.config?.compat;
		if (!c) return {};
		return {
			supportsDeveloperRole: Boolean(c.supportsDeveloperRole),
			supportsReasoningEffort: Boolean(c.supportsReasoningEffort),
			supportsStrictTools: Boolean(c.supportsStrictTools),
		};
	});
	const [models, setModels] = useState<CustomModelDraft[]>(
		provider?.config?.models ?? (provider?.isBuiltin ? [] : [{ id: "" }]),
	);
	const [apiKey, setApiKey] = useState("");
	const [keySaved, setKeySaved] = useState(provider?.configured ?? false);

	// 抽屉复用（打开不同 provider）时重置表单
	useEffect(() => {
		setId(provider?.id ?? "");
		setBaseUrl(provider?.config?.baseUrl ?? "");
		setApi(provider?.config?.api ?? "openai-completions");
		const c = provider?.config?.compat;
		setCompat(
			c
				? {
						supportsDeveloperRole: Boolean(c.supportsDeveloperRole),
						supportsReasoningEffort: Boolean(c.supportsReasoningEffort),
						supportsStrictTools: Boolean(c.supportsStrictTools),
					}
				: {},
		);
		setModels(
			provider?.config?.models ?? (provider?.isBuiltin ? [] : [{ id: "" }]),
		);
		setApiKey("");
		setKeySaved(provider?.configured ?? false);
	}, [provider]);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: ["ai-config"] });
		void queryClient.invalidateQueries({ queryKey: ["ai-models"] });
		onChanged();
	};

	/** 保存 API Key（内置与自定义共用；为空不动作） */
	const saveKey = useMutation({
		mutationFn: async () => {
			if (!apiKey.trim() || !editingId) return;
			await saveApiKeySFn({
				data: { provider: editingId, apiKey: apiKey.trim() },
			});
		},
		onSuccess: () => {
			setApiKey("");
			setKeySaved(true);
			invalidate();
		},
	});

	/** 清除 API Key */
	const clearKey = useMutation({
		mutationFn: async () => {
			if (!editingId) return;
			await clearApiKeySFn({ data: { provider: editingId } });
		},
		onSuccess: () => {
			setKeySaved(false);
			invalidate();
		},
	});

	/** 保存自定义 provider 完整配置（新 / 编辑；内含模型列表） */
	const saveProvider = useMutation({
		mutationFn: async () => {
			if (!id.trim()) throw new Error(`${t("settings.id")} 不能为空`);
			if (!baseUrl.trim()) throw new Error("Base URL 不能为空");
			const modelsDraft = models
				.filter((m) => m.id.trim())
				.map((m) => ({
					id: m.id.trim(),
					...(m.name ? { name: m.name } : {}),
					...(m.reasoning !== undefined ? { reasoning: m.reasoning } : {}),
					...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
					...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
				}));
			// 仅保留显式开启的兼容选项（false / 未勾选不写入 models.json）
			const compatClean = Object.fromEntries(
				Object.entries(compat).filter(([, v]) => v === true),
			);
			await saveCustomProviderSFn({
				data: {
					provider: {
						id: id.trim(),
						baseUrl: baseUrl.trim(),
						api: api as (typeof API_TYPES)[number],
						...(Object.keys(compatClean).length > 0
							? { compat: compatClean }
							: {}),
						...(modelsDraft.length > 0 ? { models: modelsDraft } : {}),
					},
				},
			});
			if (apiKey.trim()) {
				await saveApiKeySFn({
					data: { provider: id.trim(), apiKey: apiKey.trim() },
				});
			}
		},
		onSuccess: () => {
			setApiKey("");
			setKeySaved(true);
			invalidate();
			onClose();
		},
	});

	/** 删除自定义 provider（内置不可删） */
	const removeProvider = useMutation({
		mutationFn: async () => {
			if (!editingId) return;
			await deleteCustomProviderSFn({ data: { providerId: editingId } });
		},
		onSuccess: () => {
			invalidate();
			onClose();
		},
	});

	const busy =
		saveKey.isPending || clearKey.isPending || saveProvider.isPending;

	return (
		<div
			className="absolute inset-y-0 right-0 z-20 flex w-[420px] flex-col border-l shadow-xl"
			style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
		>
			{/* 抽屉头部 */}
			<div
				className="flex h-10 shrink-0 items-center gap-2 border-b px-4"
				style={{ borderColor: "var(--rule)" }}
			>
				<span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
					{t(isNew ? "settings.newProvider" : "settings.editProvider")}
				</span>
				{editingId && (
					<span className="text-xs" style={{ color: "var(--muted)" }}>
						{editingId}
					</span>
				)}
				<button
					type="button"
					onClick={onClose}
					className="ml-auto rounded px-1.5 text-xs"
					style={{ color: "var(--muted)" }}
				>
					✕
				</button>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
				{/* 自定义 provider 完整配置 */}
				{!isBuiltin && (
					<>
						<Field label={t("settings.id")}>
							<input
								value={id}
								disabled={!isNew}
								onChange={(e) => setId(e.target.value)}
								placeholder="my-provider"
								style={{ opacity: !isNew ? 0.6 : 1 }}
							/>
						</Field>
						<Field label={t("settings.baseUrl")}>
							<input
								value={baseUrl}
								onChange={(e) => setBaseUrl(e.target.value)}
								placeholder="https://api.example.com/v1"
							/>
						</Field>
						<Field label={t("settings.apiType")}>
							<select value={api} onChange={(e) => setApi(e.target.value)}>
								{API_TYPES.map((a) => (
									<option key={a} value={a}>
										{a}
									</option>
								))}
							</select>
						</Field>

						{/* 兼容选项（高级折叠为区块） */}
						<details>
							<summary
								className="cursor-pointer text-xs font-medium"
								style={{ color: "var(--muted)" }}
							>
								{t("settings.compatOptions")}
							</summary>
							<div
								className="mt-2 space-y-1.5 rounded border p-2"
								style={{ borderColor: "var(--rule)" }}
							>
								{COMPAT_FIELDS.map((f) => (
									<label
										key={f.key}
										className="flex items-center gap-2 text-sm"
										style={{ color: "var(--ink)" }}
									>
										<input
											type="checkbox"
											checked={Boolean(compat[f.key])}
											onChange={(e) =>
												setCompat((prev) => ({
													...prev,
													[f.key]: e.target.checked || undefined,
												}))
											}
										/>
										{t(f.label)}
									</label>
								))}
							</div>
						</details>

						{/* 模型列表 */}
						<div>
							<div className="mb-1.5 flex items-center justify-between">
								<span
									className="text-xs font-medium"
									style={{ color: "var(--muted)" }}
								>
									{t("settings.models")}
								</span>
								<button
									type="button"
									className="text-xs"
									style={{ color: "var(--accent)" }}
									onClick={() => setModels((prev) => [...prev, { id: "" }])}
								>
									+ {t("settings.addModel")}
								</button>
							</div>
							<div className="space-y-2">
								{models.map((m, idx) => (
									<div
										key={idx}
										className="rounded border p-2"
										style={{ borderColor: "var(--rule)" }}
									>
										<div className="flex items-center gap-1.5">
											<input
												value={m.id}
												onChange={(e) =>
													setModels((prev) =>
														prev.map((x, i) =>
															i === idx ? { ...x, id: e.target.value } : x,
														),
													)
												}
												placeholder={t("settings.modelId")}
												className="flex-1"
											/>
											<button
												type="button"
												className="shrink-0 rounded px-1 text-xs"
												style={{ color: "var(--danger)" }}
												onClick={() =>
													setModels((prev) => prev.filter((_, i) => i !== idx))
												}
											>
												✕
											</button>
										</div>
										<div
											className="mt-1.5 flex items-center gap-3 text-xs"
											style={{ color: "var(--muted)" }}
										>
											<label className="flex items-center gap-1">
												<input
													type="checkbox"
													checked={Boolean(m.reasoning)}
													onChange={(e) =>
														setModels((prev) =>
															prev.map((x, i) =>
																i === idx
																	? {
																			...x,
																			reasoning: e.target.checked || undefined,
																		}
																	: x,
															),
														)
													}
												/>
												{t("settings.reasoning")}
											</label>
											<label className="flex items-center gap-1">
												{t("settings.contextWindow")}
												<input
													type="number"
													value={m.contextWindow ?? ""}
													placeholder="128000"
													style={{ width: 88 }}
													onChange={(e) =>
														setModels((prev) =>
															prev.map((x, i) =>
																i === idx
																	? {
																			...x,
																			contextWindow: e.target.value
																				? Number(e.target.value)
																				: undefined,
																		}
																	: x,
															),
														)
													}
												/>
											</label>
										</div>
									</div>
								))}
							</div>
						</div>
					</>
				)}

				{/* API Key（新建 Provider 时同样可输入，随「保存」一并加密入库） */}
				<Field label={t("settings.apiKey")}>
					<div className="flex items-center gap-1.5">
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder={keySaved ? "••••••••" : ""}
						/>
						{!isNew && (
							<button
								type="button"
								className="shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-white disabled:opacity-50"
								style={{ background: "var(--accent)" }}
								disabled={!apiKey.trim() || !editingId || busy}
								onClick={() => void saveKey.mutate()}
							>
								{t("settings.saveKey")}
							</button>
						)}
					</div>
					<div
						className="mt-1 flex items-center gap-2 text-xs"
						style={{ color: "var(--muted)" }}
					>
						{keySaved ? (
							<>
								<span
									className="inline-block size-1.5 rounded-full"
									style={{ background: "var(--ok)" }}
								/>
								{t("settings.apiKeyHint")}
								<button
									type="button"
									className="underline"
									style={{ color: "var(--danger)" }}
									onClick={() => void clearKey.mutate()}
								>
									{t("settings.clearKey")}
								</button>
							</>
						) : isNew ? (
							<span>{t("settings.apiKeyWithSaveHint")}</span>
						) : (
							<span>{t("settings.providerUnconfigured")}</span>
						)}
					</div>
				</Field>

				{(saveKey.isError || clearKey.isError || saveProvider.isError) && (
					<div
						className="rounded border p-2 text-xs"
						style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
					>
						{String(
							(saveKey.error ?? clearKey.error ?? saveProvider.error)
								?.message ?? "操作失败",
						)}
					</div>
				)}
			</div>

			{/* 底部操作区 */}
			<div
				className="flex shrink-0 items-center gap-2 border-t p-3"
				style={{ borderColor: "var(--rule)" }}
			>
				{!isBuiltin && (
					<>
						{!isNew && (
							<button
								type="button"
								className="rounded-md px-3 py-1.5 text-sm"
								style={{
									color: "var(--danger)",
									border: "1px solid var(--danger)",
								}}
								disabled={removeProvider.isPending}
								onClick={() => {
									if (window.confirm(t("settings.removeProviderConfirm")))
										void removeProvider.mutate();
								}}
							>
								{t("settings.removeProvider")}
							</button>
						)}
						<button
							type="button"
							className="ml-auto rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
							style={{ background: "var(--accent)" }}
							disabled={busy}
							onClick={() => void saveProvider.mutate()}
						>
							{t("settings.save")}
						</button>
					</>
				)}
				{isBuiltin && (
					<button
						type="button"
						className="ml-auto rounded-md px-3 py-1.5 text-sm"
						style={{ color: "var(--muted)" }}
						onClick={onClose}
					>
						{t("common.close")}
					</button>
				)}
			</div>
		</div>
	);
}

/** 表单项包装（label + 控件） */
function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div
				className="mb-1 text-xs font-medium"
				style={{ color: "var(--muted)" }}
			>
				{label}
			</div>
			{children}
		</div>
	);
}
