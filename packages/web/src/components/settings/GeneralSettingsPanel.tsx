/**
 * 通用设置面板（系统设置 → 通用）：
 * 外观（明暗主题，持久化 appearance.theme）+ 系统信息（数据目录只读展示）。
 * 主题切换接线 getGlobalSettingSFn / setGlobalSettingSFn + 桌面 store（决策记录 D21）。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	getGlobalSettingSFn,
	getSystemInfoSFn,
	setGlobalSettingSFn,
} from "#/services/settings/settings.functions";
import { useDesktopStore } from "#/stores/windows";

const THEME_KEY = "appearance.theme";

export function GeneralSettingsPanel() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const theme = useDesktopStore((s) => s.theme);
	const setTheme = useDesktopStore((s) => s.setTheme);

	const { data: sysInfo } = useQuery({
		queryKey: ["system-info"],
		queryFn: () => getSystemInfoSFn({ data: {} }),
	});

	/** 切换主题：本地 store + 持久化 appearance.theme（写失败不阻断 UI 切换） */
	const changeTheme = async (next: "light" | "dark") => {
		setTheme(next);
		try {
			await setGlobalSettingSFn({ data: { key: THEME_KEY, value: next } });
			void queryClient.invalidateQueries({
				queryKey: ["global-setting", THEME_KEY],
			});
		} catch (err) {
			console.warn("[settings] 主题持久化失败:", err);
		}
	};

	return (
		<div className="flex flex-col gap-4 overflow-y-auto p-4">
			{/* 外观 */}
			<section
				className="rounded-lg border p-4"
				style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
			>
				<h3
					className="mb-3 text-sm font-medium"
					style={{ color: "var(--ink)" }}
				>
					{t("settings.appearance")}
				</h3>
				<div className="flex items-center justify-between">
					<span className="text-sm" style={{ color: "var(--ink)" }}>
						{t("settings.theme")}
					</span>
					<div
						className="flex items-center gap-1 rounded border p-0.5"
						style={{ borderColor: "var(--rule)" }}
					>
						{(["light", "dark"] as const).map((value) => (
							<button
								key={value}
								type="button"
								className="rounded px-3 py-1 text-sm"
								style={{
									color: theme === value ? "#fff" : "var(--muted)",
									background: theme === value ? "var(--accent)" : "transparent",
								}}
								onClick={() => void changeTheme(value)}
							>
								{t(
									value === "light"
										? "settings.themeLight"
										: "settings.themeDark",
								)}
							</button>
						))}
					</div>
				</div>
			</section>

			{/* 系统信息 */}
			<section
				className="rounded-lg border p-4"
				style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
			>
				<h3
					className="mb-3 text-sm font-medium"
					style={{ color: "var(--ink)" }}
				>
					{t("settings.systemInfo")}
				</h3>
				<div className="flex items-center justify-between">
					<span className="text-sm" style={{ color: "var(--ink)" }}>
						{t("settings.dataDir")}
					</span>
					<code
						className="max-w-[60%] truncate rounded px-2 py-0.5 text-xs"
						style={{ background: "var(--bg3)", color: "var(--muted)" }}
						title={sysInfo?.dataDir}
					>
						{sysInfo?.dataDir ?? "…"}
					</code>
				</div>
			</section>
		</div>
	);
}

/** 应用启动时读取持久化主题（供 AppShell 初始化调用） */
export async function loadPersistedTheme(): Promise<void> {
	try {
		const value = await getGlobalSettingSFn({
			data: { key: THEME_KEY },
		});
		if (value === "light" || value === "dark") {
			useDesktopStore.getState().setTheme(value);
		}
	} catch {
		// 未配置 / 服务不可达时保持默认（dark）
	}
}
