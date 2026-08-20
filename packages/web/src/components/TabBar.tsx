/**
 * Tab 栏（docs 界面设计 §2.5）：一个连接一个 Tab，活跃 Tab 底部 accent 下划线，
 * 关闭按钮；重复点击连接聚焦已有 Tab（决策记录 D11）。
 */

import { useTranslation } from "react-i18next";
import { useDesktopStore } from "#/stores/windows";

const STATUS_COLOR: Record<string, string> = {
	online: "var(--accent)",
	connecting: "var(--warn)",
	error: "var(--danger)",
	offline: "var(--muted)",
};

export function TabBar() {
	const { t } = useTranslation();
	const tabs = useDesktopStore((s) => s.tabs);
	const activeTabId = useDesktopStore((s) => s.activeTabId);
	const focusTab = useDesktopStore((s) => s.focusTab);
	const closeTab = useDesktopStore((s) => s.closeTab);

	return (
		<div
			className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto px-2"
			style={{
				background: "var(--bg2)",
				borderBottom: "1px solid var(--rule)",
			}}
		>
			{tabs.map((tab) => {
				const active = tab.connectionId === activeTabId;
				return (
					<div
						key={tab.connectionId}
						className="group flex min-w-0 max-w-52 cursor-pointer items-center gap-1.5 rounded-t px-3 py-1.5 text-sm"
						style={{
							background: active ? "var(--bg)" : "transparent",
							color: "var(--ink)",
							borderBottom: active
								? "2px solid var(--accent)"
								: "2px solid transparent",
						}}
						onClick={() => focusTab(tab.connectionId)}
					>
						<span
							className="inline-block size-1.5 shrink-0 rounded-full"
							style={{ background: STATUS_COLOR[tab.status] ?? "var(--muted)" }}
						/>
						<span className="truncate">{tab.title}</span>
						<button
							type="button"
							title={t("common.close")}
							onClick={(e) => {
								e.stopPropagation();
								closeTab(tab.connectionId);
							}}
							className="ml-1 shrink-0 rounded px-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
							style={{ color: "var(--muted)" }}
						>
							✕
						</button>
					</div>
				);
			})}
		</div>
	);
}
