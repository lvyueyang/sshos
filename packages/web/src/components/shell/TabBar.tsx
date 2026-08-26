/**
 * Tab 栏（docs 界面设计 §2.5）：一个连接一个 Tab，活跃 Tab 底部品牌色下划线，
 * 关闭按钮；重复点击连接聚焦已有 Tab（决策记录 D11）。
 * Tab 关闭时先回收 App 实例并断开 SSH 会话（服务端同步清理审批挂起项）。
 */

import { RiCloseLine } from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { disposeAppManager } from "#/app-framework/app-instances";
import { disconnectSFn } from "#/apps/terminal/terminal.functions";
import { StatusDot } from "#/components/shared/StatusDot";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { useDesktopStore } from "#/stores/windows";

export function TabBar() {
	const { t } = useTranslation();
	const tabs = useDesktopStore((s) => s.tabs);
	const activeTabId = useDesktopStore((s) => s.activeTabId);
	const focusTab = useDesktopStore((s) => s.focusTab);
	const closeTab = useDesktopStore((s) => s.closeTab);

	/** 关闭 Tab：回收 App 实例 → 断开 SSH（清审批挂起）→ 从 store 移除 */
	const handleClose = (tab: (typeof tabs)[number]) => {
		disposeAppManager(tab.connectionId);
		if (tab.sessionId) {
			void disconnectSFn({ data: { sessionId: tab.sessionId } }).catch((err) =>
				console.warn("[tab] 断开会话失败:", err),
			);
		}
		closeTab(tab.connectionId);
	};

	return (
		<div className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-card px-2">
			{tabs.map((tab) => {
				const active = tab.connectionId === activeTabId;
				return (
					<div
						key={tab.connectionId}
						role="tab"
						aria-selected={active}
						tabIndex={0}
						className={cn(
							"group flex min-w-0 max-w-52 cursor-pointer items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors",
							active
								? "border-primary bg-background text-foreground"
								: "border-transparent text-muted-foreground hover:bg-muted/60",
						)}
						onClick={() => focusTab(tab.connectionId)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								focusTab(tab.connectionId);
							}
						}}
					>
						<StatusDot status={tab.status} />
						<span className="truncate">{tab.title}</span>
						<Button
							variant="ghost"
							size="icon-xs"
							type="button"
							title={t("common.close")}
							aria-label={t("common.close")}
							className="ml-1 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
							onClick={(e) => {
								e.stopPropagation();
								handleClose(tab);
							}}
						>
							<RiCloseLine className="size-3" />
						</Button>
					</div>
				);
			})}
		</div>
	);
}
