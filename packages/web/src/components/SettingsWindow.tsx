/**
 * 系统设置窗口（全局浮层，docs 技术架构 §8 扩展）：
 * 不绑定任何连接 Tab（模型 / 主题为系统级），由 AppShell 渲染、Sidebar ⚙ 打开。
 * 左侧导航分组（模型 / 通用），右侧内容面板；单实例。
 */

import { useTranslation } from "react-i18next";
import { useSettingsUiStore } from "#/stores/settings-ui";
import { GeneralSettingsPanel } from "./settings/GeneralSettingsPanel";
import { ModelSettingsPanel } from "./settings/ModelSettingsPanel";

const NAV_ITEMS = [
	{ id: "model", labelKey: "settings.sectionModel", icon: "◆" },
	{ id: "general", labelKey: "settings.sectionGeneral", icon: "⚙" },
] as const;

export function SettingsWindow() {
	const { t } = useTranslation();
	const open = useSettingsUiStore((s) => s.open);
	const section = useSettingsUiStore((s) => s.section);
	const closeSettings = useSettingsUiStore((s) => s.closeSettings);
	const setSection = useSettingsUiStore((s) => s.setSection);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-[1000] flex items-center justify-center">
			{/* 遮罩：点击空白关闭 */}
			<div className="absolute inset-0 bg-black/40" onClick={closeSettings} />
			{/* 设置窗口 */}
			<div
				className="relative flex h-[560px] w-[820px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-xl border shadow-2xl"
				style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
			>
				{/* 标题栏 */}
				<div
					className="flex h-9 shrink-0 items-center gap-2 border-b px-4"
					style={{ borderColor: "var(--rule)" }}
				>
					<span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
						{t("settings.title")}
					</span>
					<button
						type="button"
						title={t("common.close")}
						aria-label={t("common.close")}
						className="ml-auto flex size-6 items-center justify-center rounded text-xs"
						style={{ color: "var(--danger)" }}
						onClick={closeSettings}
					>
						✕
					</button>
				</div>

				<div className="flex min-h-0 flex-1">
					{/* 左侧导航 */}
					<nav
						className="flex w-44 shrink-0 flex-col gap-0.5 border-r p-2"
						style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
					>
						{NAV_ITEMS.map((item) => {
							const active = section === item.id;
							return (
								<button
									key={item.id}
									type="button"
									className="flex items-center gap-2 rounded px-2.5 py-1.5 text-sm"
									style={{
										color: active ? "var(--ink)" : "var(--muted)",
										background: active ? "var(--bg3)" : "transparent",
										fontWeight: active ? 600 : 400,
									}}
									onClick={() => setSection(item.id)}
								>
									<span className="w-4 text-center text-xs">{item.icon}</span>
									{t(item.labelKey)}
								</button>
							);
						})}
					</nav>

					{/* 右侧内容（面板容器） */}
					<div
						className="relative min-w-0 flex-1 overflow-hidden"
						style={{ background: "var(--bg2)" }}
					>
						{section === "model" ? (
							<ModelSettingsPanel />
						) : (
							<GeneralSettingsPanel />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
