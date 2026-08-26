/**
 * 系统设置窗口（全局浮层，docs 技术架构 §8 扩展）：
 * 不绑定任何连接 Tab（模型 / 主题为系统级），由 AppShell 渲染、Sidebar ⚙ 打开。
 * 左侧导航分组（模型 / 通用），右侧内容面板；单实例。
 * 视觉走语义 token + Remix 图标（docs/07 §3/§4）。
 */

import { RiCpuLine, RiSettings4Line } from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { useSettingsUiStore } from "#/stores/settings-ui";
import { GeneralSettingsPanel } from "./settings/GeneralSettingsPanel";
import { ModelSettingsPanel } from "./settings/ModelSettingsPanel";

const NAV_ITEMS = [
	{ id: "model", labelKey: "settings.sectionModel", Icon: RiCpuLine },
	{ id: "general", labelKey: "settings.sectionGeneral", Icon: RiSettings4Line },
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
			<div className="relative flex h-[560px] w-[820px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
				{/* 标题栏 */}
				<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
					<span className="text-sm font-medium text-foreground">
						{t("settings.title")}
					</span>
					<Button
						variant="ghost"
						size="icon-xs"
						type="button"
						title={t("common.close")}
						aria-label={t("common.close")}
						className="ml-auto text-muted-foreground hover:text-danger"
						onClick={closeSettings}
					>
						<span className="text-xs">✕</span>
					</Button>
				</div>

				<div className="flex min-h-0 flex-1">
					{/* 左侧导航 */}
					<nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-background p-2">
						{NAV_ITEMS.map((item) => {
							const active = section === item.id;
							const Icon = item.Icon;
							return (
								<Button
									key={item.id}
									variant="ghost"
									type="button"
									className={cn(
										"justify-start gap-2 px-2.5 text-sm",
										active && "bg-muted font-semibold text-foreground",
									)}
									onClick={() => setSection(item.id)}
								>
									<Icon className="size-4" />
									{t(item.labelKey)}
								</Button>
							);
						})}
					</nav>

					{/* 右侧内容（面板容器） */}
					<div className="relative min-w-0 flex-1 overflow-hidden bg-card">
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
