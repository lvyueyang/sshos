/**
 * 通用设置面板（系统设置 → 通用）：
 * 外观（明暗 / 密度 / 字号，持久化由 ThemeProvider 统一处理，docs/06 §4.3）
 * + 系统信息（数据目录只读展示）。视觉走语义 token + shadcn（docs/07 §3）。
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { getSystemInfoSFn } from "#/services/settings/connections/settings.functions";
import {
	type FontScale,
	type ThemeDensity,
	useThemeStore,
} from "#/stores/theme";

export function GeneralSettingsPanel() {
	const { t } = useTranslation();
	const scheme = useThemeStore((s) => s.scheme);
	const setScheme = useThemeStore((s) => s.setScheme);
	const density = useThemeStore((s) => s.density);
	const setDensity = useThemeStore((s) => s.setDensity);
	const fontScale = useThemeStore((s) => s.fontScale);
	const setFontScale = useThemeStore((s) => s.setFontScale);

	const { data: sysInfo } = useQuery({
		queryKey: ["system-info"],
		queryFn: () => getSystemInfoSFn({ data: {} }),
	});

	return (
		<div className="flex flex-col gap-4 overflow-y-auto p-4">
			{/* 外观：明暗 / 密度 / 字号（写入 theme store，ThemeProvider 自动持久化） */}
			<section className="rounded-lg border border-border bg-background p-4">
				<h3 className="mb-3 text-sm font-medium text-foreground">
					{t("settings.appearance")}
				</h3>

				<SettingRow label={t("settings.theme")}>
					<Segmented
						value={scheme}
						options={[
							{ value: "light", label: t("settings.themeLight") },
							{ value: "dark", label: t("settings.themeDark") },
						]}
						onChange={(v) => setScheme(v as "light" | "dark")}
					/>
				</SettingRow>

				<SettingRow label={t("settings.density")}>
					<Segmented
						value={density}
						options={[
							{ value: "compact", label: t("settings.densityCompact") },
							{ value: "normal", label: t("settings.densityNormal") },
							{ value: "comfortable", label: t("settings.densityComfortable") },
						]}
						onChange={(v) => setDensity(v as ThemeDensity)}
					/>
				</SettingRow>

				<SettingRow label={t("settings.fontScale")}>
					<Segmented
						value={fontScale}
						options={[
							{ value: "sa", label: t("settings.fontScaleSa") },
							{ value: "default", label: t("settings.fontScaleDefault") },
							{ value: "lg", label: t("settings.fontScaleLg") },
							{ value: "xl", label: t("settings.fontScaleXl") },
						]}
						onChange={(v) => setFontScale(v as FontScale)}
					/>
				</SettingRow>
			</section>

			{/* 系统信息 */}
			<section className="rounded-lg border border-border bg-background p-4">
				<h3 className="mb-3 text-sm font-medium text-foreground">
					{t("settings.systemInfo")}
				</h3>
				<SettingRow label={t("settings.dataDir")}>
					<code
						className="max-w-[60%] truncate rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
						title={sysInfo?.dataDir}
					>
						{sysInfo?.dataDir ?? "…"}
					</code>
				</SettingRow>
			</section>
		</div>
	);
}

/** 设置行：左侧标签 + 右侧控件 */
function SettingRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-sm text-foreground">{label}</span>
			{children}
		</div>
	);
}

/** 分段选择器（明暗 / 密度 / 字号通用）：选中项 primary，未选中 ghost */
function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
}) {
	return (
		<div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
			{options.map((opt) => (
				<Button
					key={opt.value}
					variant={value === opt.value ? "default" : "ghost"}
					size="xs"
					type="button"
					onClick={() => onChange(opt.value)}
				>
					{opt.label}
				</Button>
			))}
		</div>
	);
}
