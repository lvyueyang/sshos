/**
 * 任务栏（docs 界面设计 §3.5）：已打开窗口快捷区 + 系统托盘（连接状态 + 主机信息）。
 */

import { type TabState, useDesktopStore } from "#/stores/windows";

export function Taskbar({ tab }: { tab: TabState }) {
	const windows = useDesktopStore(
		(s) => s.windowsByTab[tab.connectionId] ?? {},
	);
	const focusWindow = useDesktopStore((s) => s.focusWindow);

	return (
		<div
			className="absolute inset-x-0 bottom-0 flex h-10 items-center gap-2 border-t px-3"
			style={{
				background: "rgba(13,17,23,0.85)",
				backdropFilter: "blur(8px)",
				borderColor: "var(--rule)",
			}}
		>
			{/* 运行中窗口 */}
			{Object.entries(windows).map(([id, win]) => (
				<button
					key={id}
					type="button"
					title={id}
					onClick={() => focusWindow(tab.connectionId, id)}
					className="flex h-7 items-center rounded px-2 text-xs"
					style={{
						background: win.minimized ? "transparent" : "var(--bg3)",
						color: "var(--ink)",
						borderBottom: "2px solid var(--accent2)",
					}}
				>
					{id.split("-")[0]}
				</button>
			))}

			<div
				className="ml-auto flex items-center gap-3 text-xs"
				style={{ color: "var(--muted)" }}
			>
				<span className="flex items-center gap-1.5">
					<span
						className="inline-block size-2 rounded-full"
						style={{
							background:
								tab.status === "online" ? "var(--accent)" : "var(--muted)",
						}}
					/>
					{tab.title}
				</span>
			</div>
		</div>
	);
}
