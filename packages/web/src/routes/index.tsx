/**
 * 首页：有活动连接 Tab 时渲染对应桌面，否则展示空状态引导（docs 界面设计 §4.4 / §7）。
 * 挂载 useDeepLink 消费 ssh:// 深链（docs §4.6）：命中连接则连接，否则预填新建抽屉。
 * 视觉走语义 token + shadcn Button（docs/07 §3）。
 */

import { RiAddLine } from "@remixicon/react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Desktop } from "#/components/shell/Desktop";
import { Button } from "#/components/ui/button";
import { useDeepLink } from "#/hooks/use-deep-link";
import { useUiStore } from "#/stores/ui";
import { useDesktopStore } from "#/stores/windows";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	const { t } = useTranslation();
	const tabs = useDesktopStore((s) => s.tabs);
	const activeTabId = useDesktopStore((s) => s.activeTabId);
	const activeTab = tabs.find((tab) => tab.connectionId === activeTabId);
	const requestNewConnection = useUiStore((s) => s.requestNewConnection);
	useDeepLink();

	if (activeTab) {
		return <Desktop tab={activeTab} />;
	}

	return (
		<main className="flex h-full items-center justify-center [background:var(--desktop-bg)]">
			<div className="flex max-w-md flex-col items-center gap-6 rounded-xl border border-dashed border-border p-10 text-center">
				<div className="flex size-12 items-center justify-center rounded-full border border-border bg-muted">
					<RiAddLine className="size-5 text-muted-foreground" />
				</div>
				<div>
					<h1 className="text-xl font-bold text-foreground">
						{t("sidebar.addFirstConnection")}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{t("sidebar.supportsAuth")}
					</p>
				</div>
				<Button type="button" onClick={() => requestNewConnection()}>
					{t("sidebar.start")}
				</Button>
			</div>
		</main>
	);
}
