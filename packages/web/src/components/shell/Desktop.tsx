/**
 * 桌面容器（docs 界面设计 §3.2）：每个 SSH 连接 Tab 一个桌面。
 * 图标 / 面板 / 窗口内容均由 app 插件注册表（registry + app-views）驱动，外壳不硬编码分发表；
 * 每 Tab 通过 AppManager 驱动自启 app 生命周期，Tab 关闭时统一回收。
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ensureAppManager } from "#/app-framework/app-instances";
import type { AppManagerDeps } from "#/app-framework/app-manager";
import { getAppViews } from "#/app-framework/app-views";
import {
	listAutoStartApps,
	listPanelApps,
	listWindowApps,
} from "#/app-framework/registry";
import type { AppContext, AppDefinition } from "#/app-framework/types";
import { registerBuiltinApps } from "#/apps";
import { AppIcon } from "#/components/shared/AppIcon";
import {
	getConnectionSettingSFn,
	recordAuditSFn,
	setConnectionSettingSFn,
} from "#/services/settings/connections/settings.functions";
import { type TabState, useDesktopStore } from "#/stores/windows";
import { cn } from "#/utils";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";

// 模块级一次性注册内置 app（重复注册会抛错，仅执行一次）
registerBuiltinApps();

interface DesktopProps {
	tab: TabState;
}

/** 客户端日志适配器（AppManager 注入，避免拉服务端 pino 进 client bundle） */
const clientLog: AppContext["log"] = {
	debug: (...args) => console.debug("[app]", ...args),
	info: (...args) => console.info("[app]", ...args),
	warn: (...args) => console.warn("[app]", ...args),
	error: (...args) => console.error("[app]", ...args),
};

/** 由 SFn 构建 AppManager 依赖（settings / audit 均走服务端） */
function buildDeps(connectionId: number, sessionId: string): AppManagerDeps {
	return {
		settings: {
			get: (key) =>
				getConnectionSettingSFn({
					data: { connectionId, key },
				}),
			set: (key, value) =>
				setConnectionSettingSFn({
					data: { connectionId, key, value },
				}).then(() => undefined),
		},
		audit: {
			record: (entry) =>
				recordAuditSFn({
					data: {
						sessionId,
						command: entry.command,
						classification: entry.classification,
						action: entry.action,
						result: entry.result,
					},
				}).then(() => undefined),
		},
		log: clientLog,
	};
}

/** 取 app window surface 的默认尺寸 */
function defaultWindowSize(app: AppDefinition) {
	const surface = app.manifest.surfaces.find((s) => s.kind === "window");
	return surface?.kind === "window" ? surface.defaultSize : undefined;
}

export function Desktop({ tab }: DesktopProps) {
	const windows = useDesktopStore(
		(s) =>
			s.tabs.find((t) => t.connectionId === tab.connectionId)?.windows ?? {},
	);
	const openWindow = useDesktopStore((s) => s.openWindow);

	const windowApps = useMemo(() => listWindowApps(), []);
	const panelApps = useMemo(() => listPanelApps(), []);

	// 每 Tab 一个 AppManager：连接就绪后自启 autoStart app（statusbar / panel），Tab 关闭时回收
	const connectionId = tab.connectionId;
	const sessionId = tab.sessionId;
	useEffect(() => {
		if (!sessionId) return;
		const manager = ensureAppManager(
			connectionId,
			sessionId,
			buildDeps(connectionId, sessionId),
		);
		for (const app of listAutoStartApps()) {
			void manager.start(app.manifest.id).catch((err: unknown) => {
				clientLog.warn(`App 自启失败: ${app.manifest.id}`, err);
			});
		}
	}, [connectionId, sessionId]);

	return (
		<div className="relative h-full overflow-hidden [background:var(--desktop-bg)]">
			{/* 桌面图标（仅 window surface app） */}
			<div className="absolute left-4 top-4 flex flex-col gap-2">
				{windowApps.map((app) => {
					const size = defaultWindowSize(app) ?? { w: 640, h: 400 };
					const singleton = app.manifest.singleton === true;
					return (
						<DesktopIcon
							key={app.manifest.id}
							app={app}
							onOpen={() =>
								openWindow(
									tab.connectionId,
									singleton
										? app.manifest.id
										: `${app.manifest.id}-${Object.keys(windows).length + 1}`,
									{
										x: 60 + (Object.keys(windows).length % 3) * 30,
										y: 40,
										w: size.w,
										h: size.h,
									},
								)
							}
						/>
					);
				})}
			</div>

			{/* 面板层（panel surface，自启右上角） */}
			{tab.sessionId && panelApps.length > 0 && (
				<div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
					{panelApps.map((app) => {
						const PanelView = getAppViews(app.manifest.id).panelView;
						return PanelView ? (
							<div key={app.manifest.id}>
								<PanelView sessionId={tab.sessionId ?? ""} />
							</div>
						) : null;
					})}
				</div>
			)}

			{/* 窗口层（AnimatePresence：关闭时播放退场动画） */}
			<AnimatePresence>
				{Object.entries(windows).map(([id]) => (
					<Window
						key={id}
						tabId={tab.connectionId}
						windowId={id}
						title={windowTitle(tab, id, windowApps)}
					>
						{renderApp(id, tab)}
					</Window>
				))}
			</AnimatePresence>

			<Taskbar tab={tab} />
		</div>
	);
}

/** 应用窗口标题：`连接名 - 应用名`（多开窗口追加 #N） */
function windowTitle(
	tab: TabState,
	windowId: string,
	apps: AppDefinition[],
): string {
	const appId = windowId.split("-")[0];
	const app = apps.find((a) => a.manifest.id === appId);
	const title = app?.manifest.title ?? appId;
	const seq = windowId.includes("-")
		? windowId.split("-").slice(1).join(".")
		: "";
	return `${tab.title} - ${title}${seq ? ` #${seq}` : ""}`;
}

/** 应用窗口内容分发：经 app-views 注册表取 windowView（windowId 前缀为 app id） */
function renderApp(windowId: string, tab: TabState) {
	const appId = windowId.split("-")[0];
	const WindowView = getAppViews(appId).windowView;
	if (!WindowView) return null;
	return <WindowView sessionId={tab.sessionId ?? ""} />;
}

/** 桌面图标：单击选中（品牌色高亮 + 半透明底），双击打开（docs/03 §3.3） */
function DesktopIcon({
	app,
	onOpen,
}: {
	app: AppDefinition;
	onOpen: () => void;
}) {
	const [selected, setSelected] = useState(false);
	return (
		<motion.button
			type="button"
			whileHover={{ y: -2 }}
			whileTap={{ scale: 0.96 }}
			transition={{ duration: 0.12 }}
			onClick={() => setSelected(true)}
			onDoubleClick={onOpen}
			className={cn(
				"flex w-[72px] flex-col items-center gap-1 rounded-md p-2 transition-colors",
				selected ? "bg-muted/60" : "hover:bg-muted/40",
			)}
		>
			<div
				className={cn(
					"flex size-10 items-center justify-center rounded-lg border bg-muted/20",
					selected ? "border-primary" : "border-transparent",
				)}
			>
				<AppIcon icon={app.manifest.icon} appId={app.manifest.id} size={24} />
			</div>
			<span className="max-w-full truncate text-xs text-foreground/90">
				{app.manifest.title}
			</span>
		</motion.button>
	);
}
