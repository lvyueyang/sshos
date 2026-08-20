/**
 * 桌面容器（docs 界面设计 §3.2）：每个 SSH 连接 Tab 一个桌面。
 * 图标网格 + 窗口层 + 任务栏；窗口渲染按 windowId 前缀分发到对应应用。
 */

import { AiPanel } from "#/apps/ai/AiPanel";
import { FileManager } from "#/apps/files/FileManager";
import { MonitorDashboard } from "#/apps/monitor/MonitorDashboard";
import { TerminalWindow } from "#/apps/terminal/TerminalWindow";
import { type TabState, useDesktopStore } from "#/stores/windows";
import { Taskbar } from "./Taskbar";
import { Window } from "./Window";

interface DesktopProps {
	tab: TabState;
}

/** 应用窗口内容分发：windowId 形如 <app>-<序号> */
function renderApp(windowId: string, tab: TabState) {
	const app = windowId.split("-")[0];
	switch (app) {
		case "terminal":
			return <TerminalWindow sessionId={tab.sessionId ?? ""} />;
		case "files":
			return <FileManager sessionId={tab.sessionId ?? ""} />;
		case "monitor":
			return <MonitorDashboard sessionId={tab.sessionId ?? ""} />;
		case "ai":
			return <AiPanel sessionId={tab.sessionId ?? ""} />;
		default:
			return null;
	}
}

export function Desktop({ tab }: DesktopProps) {
	const windows = useDesktopStore(
		(s) => s.windowsByTab[tab.connectionId] ?? {},
	);
	const openWindow = useDesktopStore((s) => s.openWindow);

	const windowTitles: Record<string, string> = {
		"terminal-1": `${tab.title} - 终端`,
		"terminal-2": `${tab.title} - 终端 #2`,
		"terminal-3": `${tab.title} - 终端 #3`,
		files: `${tab.title} - 文件`,
		monitor: `${tab.title} - 监控`,
		ai: `${tab.title} - AI`,
	};

	return (
		<div
			className="relative h-full overflow-hidden"
			style={{ background: "var(--desktop-bg)" }}
		>
			{/* 桌面图标 */}
			<div className="absolute left-4 top-4 flex flex-col gap-2">
				<DesktopIcon
					label="终端"
					color="var(--accent)"
					onOpen={() =>
						openWindow(
							tab.connectionId,
							`terminal-${Object.keys(windows).length + 1}`,
							{
								x: 60 + (Object.keys(windows).length % 3) * 30,
								y: 40,
								w: 720,
								h: 480,
							},
						)
					}
				/>
				<DesktopIcon
					label="文件"
					color="var(--accent2)"
					onOpen={() =>
						openWindow(tab.connectionId, "files", {
							x: 100,
							y: 80,
							w: 760,
							h: 520,
						})
					}
				/>
				<DesktopIcon
					label="监控"
					color="#3aa0c4"
					onOpen={() =>
						openWindow(tab.connectionId, "monitor", {
							x: 140,
							y: 100,
							w: 640,
							h: 440,
						})
					}
				/>
				<DesktopIcon
					label="AI"
					color="#8b5cf6"
					onOpen={() =>
						openWindow(tab.connectionId, "ai", {
							x: 160,
							y: 120,
							w: 420,
							h: 560,
						})
					}
				/>
			</div>

			{/* 窗口层 */}
			{Object.entries(windows).map(([id]) => (
				<Window
					key={id}
					tabId={tab.connectionId}
					windowId={id}
					title={windowTitles[id] ?? `${tab.title} - ${id}`}
				>
					{renderApp(id, tab)}
				</Window>
			))}

			<Taskbar tab={tab} />
		</div>
	);
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
