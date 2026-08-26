/**
 * 任务栏（docs 界面设计 §3.5 / docs/06 §3）：已打开窗口快捷区 + statusbar 槽位（自启 app，如时钟）+ 系统托盘。
 * 内容经 app-views 注册表通用渲染，不再硬编码分发表。
 */

import { useMemo } from "react";
import { getAppViews } from "#/app-framework/app-views";
import { listStatusbarApps, listWindowApps } from "#/app-framework/registry";
import { AppIcon } from "#/components/shared/AppIcon";
import { StatusDot } from "#/components/shared/StatusDot";
import { cn } from "#/lib/utils";
import { type TabState, useDesktopStore } from "#/stores/windows";

export function Taskbar({ tab }: { tab: TabState }) {
	const windows = useDesktopStore(
		(s) => s.windowsByTab[tab.connectionId] ?? {},
	);
	const focusWindow = useDesktopStore((s) => s.focusWindow);
	const statusbarApps = useMemo(() => listStatusbarApps(), []);
	const windowApps = useMemo(() => listWindowApps(), []);

	return (
		<div className="absolute inset-x-0 bottom-0 flex h-10 items-center gap-2 border-t border-border bg-background/85 px-3 backdrop-blur-md">
			{/* 运行中窗口：聚焦态底部品牌色条（docs §3.5） */}
			{Object.entries(windows).map(([id, win]) => {
				const appId = id.split("-")[0];
				const app = windowApps.find((a) => a.manifest.id === appId);
				return (
					<button
						key={id}
						type="button"
						title={id}
						onClick={() => focusWindow(tab.connectionId, id)}
						className={cn(
							"flex h-7 items-center gap-1.5 rounded-md border-b-2 px-2 text-xs transition-colors",
							win.minimized
								? "border-transparent text-muted-foreground hover:bg-muted"
								: "border-primary bg-muted text-foreground",
						)}
					>
						{app && (
							<AppIcon
								icon={app.manifest.icon}
								appId={app.manifest.id}
								size={14}
							/>
						)}
						<span className="max-w-24 truncate">
							{app?.manifest.title ?? appId}
						</span>
					</button>
				);
			})}

			{/* statusbar 槽位（自启 app 常驻，如时钟） */}
			<div className="ml-auto flex items-center gap-3">
				{statusbarApps.map((app) => {
					const StatusbarView = getAppViews(app.manifest.id).statusbarView;
					return StatusbarView ? (
						<span key={app.manifest.id}>
							<StatusbarView />
						</span>
					) : null;
				})}
			</div>

			{/* 系统托盘：连接状态 + 主机信息 */}
			<div className="flex items-center gap-3 text-xs text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<StatusDot status={tab.status} />
					{tab.title}
				</span>
			</div>
		</div>
	);
}
