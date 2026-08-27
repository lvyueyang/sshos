/**
 * 模型配置面板（系统设置 → 模型）：
 * 顶部「当前模型」卡（默认 provider / model / thinking 级别）+
 * Provider 表（鉴权状态 / 配置密钥 / 自定义增删改），抽屉编辑走 ProviderDrawer。
 * 数据源 getAiConfigSFn / listModelsSFn，写操作后 invalidate 刷新。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getAiConfigSFn,
	listModelsSFn,
	setDefaultModelSFn,
} from "#/services/ai/config/ai-config.functions";
import { ProviderDrawer } from "./ProviderDrawer";
import type { AiProviderSummary } from "./types";

const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

export function ModelSettingsPanel() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [drawer, setDrawer] = useState<
		| {
				mode: "new";
		  }
		| { mode: "edit"; provider: AiProviderSummary }
		| null
	>(null);

	const {
		data: config,
		isError: configError,
		error: configErr,
	} = useQuery({
		queryKey: ["ai-config"],
		queryFn: () => getAiConfigSFn({ data: {} }),
	});
	const {
		data: allModels = [],
		isError: modelsError,
		error: modelsErr,
	} = useQuery({
		queryKey: ["ai-models"],
		queryFn: () => listModelsSFn({ data: {} }),
	});

	// 默认模型草稿：config 加载后同步
	const [draft, setDraft] = useState<{
		defaultProvider: string;
		defaultModel: string;
		defaultThinkingLevel: string;
	}>({
		defaultProvider: "",
		defaultModel: "",
		defaultThinkingLevel: "medium",
	});
	useEffect(() => {
		if (!config) return;
		setDraft((prev) => ({
			defaultProvider: config.defaultProvider ?? prev.defaultProvider,
			defaultModel: config.defaultModel ?? prev.defaultModel,
			defaultThinkingLevel:
				config.defaultThinkingLevel ?? prev.defaultThinkingLevel,
		}));
	}, [config]);

	// 已配置凭据的 provider（可作默认模型候选）
	const configuredProviders = useMemo(
		() => (config?.providers ?? []).filter((p) => p.configured),
		[config],
	);
	// 默认 provider 下拉：已配置 provider + 当前选择值（即使已失效）
	const providerOptions = useMemo(() => {
		const ids = new Set(configuredProviders.map((p) => p.id));
		if (draft.defaultProvider) ids.add(draft.defaultProvider);
		return (config?.providers ?? []).filter((p) => ids.has(p.id));
	}, [config, configuredProviders, draft.defaultProvider]);

	// 默认模型下拉：当前 provider 的模型
	const providerModels = useMemo(
		() => allModels.filter((m) => m.provider === draft.defaultProvider),
		[allModels, draft.defaultProvider],
	);

	const anyConfigured = configuredProviders.length > 0;

	const saveDefault = useMutation({
		mutationFn: async () => {
			await setDefaultModelSFn({
				data: {
					defaultProvider: draft.defaultProvider || undefined,
					defaultModel: draft.defaultModel || undefined,
					defaultThinkingLevel:
						draft.defaultThinkingLevel as (typeof THINKING_LEVELS)[number],
				},
			});
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["ai-config"] });
		},
	});

	return (
		<div className="relative h-full">
			<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
				{/* 配置加载失败：必须可见，不静默 */}
				{(configError || modelsError) && (
					<div
						className="rounded border p-2 text-xs"
						style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
					>
						[加载失败]{" "}
						{String(
							(configErr?.message ?? modelsErr?.message) || "模型配置读取异常",
						)}
					</div>
				)}

				{/* 当前模型卡 */}
				<section
					className="rounded-lg border p-4"
					style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
				>
					<div className="mb-3 flex items-center justify-between">
						<h3 className="text-sm font-medium" style={{ color: "var(--ink)" }}>
							{t("settings.currentModel")}
						</h3>
						<button
							type="button"
							className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
							style={{ background: "var(--accent)" }}
							disabled={saveDefault.isPending || !anyConfigured}
							onClick={() => void saveDefault.mutate()}
						>
							{t("settings.save")}
						</button>
					</div>

					{!anyConfigured && (
						<div
							className="mb-3 rounded border p-2 text-xs"
							style={{ borderColor: "var(--warn)", color: "var(--warn)" }}
						>
							{t("settings.noConfiguredProvider")}
						</div>
					)}

					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						<Field label={t("settings.defaultProvider")}>
							<select
								value={draft.defaultProvider}
								onChange={(e) => {
									setDraft((prev) => ({
										...prev,
										defaultProvider: e.target.value,
										defaultModel: "",
									}));
								}}
								disabled={!anyConfigured}
							>
								<option value="">—</option>
								{providerOptions.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</Field>
						<Field label={t("settings.defaultModel")}>
							<select
								value={draft.defaultModel}
								onChange={(e) =>
									setDraft((prev) => ({
										...prev,
										defaultModel: e.target.value,
									}))
								}
								disabled={!draft.defaultProvider}
							>
								<option value="">—</option>
								{providerModels.map((m) => (
									<option key={m.id} value={m.id}>
										{m.name === m.id ? m.id : `${m.name}（${m.id}）`}
									</option>
								))}
							</select>
						</Field>
						<Field label={t("settings.thinkingLevel")}>
							<select
								value={draft.defaultThinkingLevel}
								onChange={(e) =>
									setDraft((prev) => ({
										...prev,
										defaultThinkingLevel: e.target.value,
									}))
								}
							>
								{THINKING_LEVELS.map((l) => (
									<option key={l} value={l}>
										{l}
									</option>
								))}
							</select>
						</Field>
					</div>
					{saveDefault.isError && (
						<div className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
							{String(saveDefault.error?.message ?? t("settings.saveFailed"))}
						</div>
					)}
				</section>

				{/* Provider 表 */}
				<section className="min-h-0 flex-1">
					<div className="mb-2 flex items-center justify-between">
						<h3 className="text-sm font-medium" style={{ color: "var(--ink)" }}>
							{t("settings.provider")}
						</h3>
						<button
							type="button"
							className="text-xs font-medium"
							style={{ color: "var(--accent)" }}
							onClick={() => setDrawer({ mode: "new" })}
						>
							+ {t("settings.addProvider")}
						</button>
					</div>
					<div
						className="overflow-hidden rounded-lg border"
						style={{ borderColor: "var(--rule)" }}
					>
						<table className="w-full text-sm">
							<thead>
								<tr
									className="text-left text-xs"
									style={{ color: "var(--muted)", background: "var(--bg3)" }}
								>
									<th className="px-3 py-2 font-medium">
										{t("settings.provider")}
									</th>
									<th className="px-3 py-2 font-medium">
										{t("settings.status")}
									</th>
									<th className="px-3 py-2 text-right font-medium">
										{t("settings.modelCount")}
									</th>
									<th className="px-3 py-2 text-right font-medium" />
								</tr>
							</thead>
							<tbody>
								{(config?.providers ?? []).map((p) => (
									<tr
										key={p.id}
										className="border-t"
										style={{ borderColor: "var(--rule)" }}
									>
										<td className="px-3 py-2">
											<div style={{ color: "var(--ink)" }}>{p.name}</div>
											<div
												className="text-xs"
												style={{ color: "var(--muted)" }}
											>
												{p.id}
												{p.isBuiltin
													? ` · ${t("settings.builtin")}`
													: ` · ${t("settings.custom")}`}
											</div>
										</td>
										<td className="px-3 py-2">
											<StatusBadge configured={p.configured} />
										</td>
										<td
											className="px-3 py-2 text-right"
											style={{ color: "var(--muted)" }}
										>
											{p.modelCount}
										</td>
										<td className="px-3 py-2 text-right">
											<button
												type="button"
												className="rounded px-2 py-0.5 text-xs"
												style={{
													color: "var(--accent)",
													border: "1px solid var(--rule)",
												}}
												onClick={() => setDrawer({ mode: "edit", provider: p })}
											>
												{t("settings.configKey")}
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				<p className="text-xs" style={{ color: "var(--muted)" }}>
					{t("settings.agentRuntimeNote")}
				</p>
			</div>

			{/* Provider 配置抽屉（覆盖在面板右侧） */}
			{drawer && (
				<ProviderDrawer
					provider={drawer.mode === "edit" ? drawer.provider : null}
					onClose={() => setDrawer(null)}
					onChanged={() => undefined}
				/>
			)}
		</div>
	);
}

/** 鉴权状态徽标 */
function StatusBadge({ configured }: { configured: boolean }) {
	const { t } = useTranslation();
	const color = configured ? "var(--ok)" : "var(--muted)";
	const bg = configured ? "var(--ok-bg)" : "transparent";
	return (
		<span
			className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
			style={{ color, background: bg, border: `1px solid ${color}33` }}
		>
			<span
				className="inline-block size-1.5 rounded-full"
				style={{ background: color }}
			/>
			{t(configured ? "settings.configured" : "settings.notConfigured")}
		</span>
	);
}

/** 表单项包装 */
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
