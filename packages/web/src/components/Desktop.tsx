/**
 * 桌面容器（docs 界面设计 §3.2）：每个 SSH 连接 Tab 一个桌面。
 * 图标 / 面板 / 窗口内容均由 app 插件注册表（registry + manifest surface）驱动；
 * 每 Tab 通过 AppManager 驱动自启 app 生命周期，Tab 关闭时统一回收。
 */

import { useEffect, useMemo } from "react";
import { ensureAppManager } from "#/app-framework/app-instances";
import type { AppManagerDeps } from "#/app-framework/app-manager";
import {
	listAutoStartApps,
	listPanelApps,
	listWindowApps,
} from "#/app-framework/registry";
import type { AppContext, AppDefinition } from "#/app-framework/types";
import { registerBuiltinApps } from "#/apps";
import { AiPanel } from "#/apps/ai/AiPanel";
import { FileManager } from "#/apps/files/FileManager";
import { LogsWindow } from "#/apps/logs/LogsWindow";
import { MonitorDashboard } from "#/apps/monitor/MonitorDashboard";
import { MonitorPanel } from "#/apps/monitor/MonitorPanel";
import { TerminalWindow } from "#/apps/terminal/TerminalWindow";
import {
	getConnectionSettingSFn,
	recordAuditSFn,
	setConnectionSettingSFn,
} from "#/services/settings/settings.functions";
import { type TabState, useDesktopStore } from "#/stores/windows";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";

// 模块级一次性注册内置 app（重复注册会抛错，仅执行一次）
registerBuiltinApps();

interface DesktopProps {
	tab: TabState;
}

/** 桌面图标装饰色（按 app id） */
const ICON_COLOR: Record<string, string> = {
	terminal: "var(--accent)",
	files: "var(--accent2)",
	monitor: "#3aa0c4",
	ai: "#8b5cf6",
	clock: "var(--muted)",
	logs: "var(--warn)",
};

/** 窗口内容分发：app id → 窗口组件 */
const WINDOW_CONTENT: Record<string, (sessionId: string) => React.ReactNode> = {
	terminal: (sid) => <TerminalWindow sessionId={sid} />,
	files: (sid) => <FileManager sessionId={sid} />,
	monitor: (sid) => <MonitorDashboard sessionId={sid} />,
	ai: (sid) => <AiPanel sessionId={sid} />,
	logs: (sid) => <LogsWindow sessionId={sid} />,
};

/** 面板内容分发：app id → 面板组件（panel surface） */
const PANEL_CONTENT: Record<string, (sessionId: string) => React.ReactNode> = {
	monitor: (sid) => <MonitorPanel sessionId={sid} />,
};

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
		(s) => s.windowsByTab[tab.connectionId] ?? {},
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
		<div
			className="relative h-full overflow-hidden"
			style={{ background: "var(--desktop-bg)" }}
		>
			{/* 桌面图标（仅 window surface app） */}
			<div className="absolute left-4 top-4 flex flex-col gap-2">
				{windowApps.map((app) => {
					const size = defaultWindowSize(app) ?? { w: 640, h: 400 };
					const singleton = app.manifest.singleton === true;
					return (
						<DesktopIcon
							key={app.manifest.id}
							label={app.manifest.title}
							color={ICON_COLOR[app.manifest.id] ?? "var(--muted)"}
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
					{panelApps.map((app) => (
						<div key={app.manifest.id}>
							{PANEL_CONTENT[app.manifest.id]?.(tab.sessionId ?? "")}
						</div>
					))}
				</div>
			)}

			{/* 窗口层 */}
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

/** 应用窗口内容分发：windowId 形如 <app>-<序号>，app id 为前缀 */
function renderApp(windowId: string, tab: TabState) {
	const appId = windowId.split("-")[0];
	const render = WINDOW_CONTENT[appId];
	if (!render) return null;
	return render(tab.sessionId ?? "");
}

function DesktopIcon({
	label,
	color,
	onOpen,
}: {
	label: string;
	color: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onDoubleClick={onOpen}
			className="flex w-[72px] flex-col items-center gap-1 rounded p-2 transition-colors hover:bg-white/10"
		>
			<div
				className="flex size-9 items-center justify-center rounded border text-lg text-white"
				style={{ background: "rgba(255,255,255,0.12)", borderColor: color }}
			>
				{label[0]}
			</div>
			<span
				className="max-w-full truncate text-xs"
				style={{ color: "#e6edf3" }}
			>
				{label}
			</span>
		</button>
	);
}
