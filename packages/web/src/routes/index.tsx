/**
 * 首页：有活动连接 Tab 时渲染对应桌面，否则展示空状态引导（docs 界面设计 §4.4 / §7）。
 * 挂载 useDeepLink 消费 ssh:// 深链（docs §4.6）：命中连接则连接，否则预填新建抽屉。
 */

import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Desktop } from "#/components/Desktop";
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
		<main
			className="flex h-full items-center justify-center"
			style={{ background: "var(--desktop-bg)" }}
		>
			<div className="flex max-w-md flex-col items-center gap-6 rounded-lg border border-dashed p-10 text-center">
				<div
					className="flex size-12 items-center justify-center rounded-full text-2xl"
					style={{ background: "var(--bg2)", border: "1px solid var(--rule)" }}
				>
					+
				</div>
				<div>
					<h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
						{t("sidebar.addFirstConnection")}
					</h1>
					<p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
						{t("sidebar.supportsAuth")}
					</p>
				</div>
				<button
					type="button"
					onClick={() => requestNewConnection()}
					className="rounded-md px-4 py-2 text-sm font-medium text-white"
					style={{ background: "var(--accent)" }}
				>
					{t("sidebar.start")}
				</button>
			</div>
		</main>
	);
}
