/**
 * 通用桌面窗口组件（docs 界面设计 §3.6）：标题栏拖拽 / 边缘缩放 / 聚焦置顶 / 最小化 / 最大化。
 * 窗口状态由 Zustand store 管理（决策记录 D10），纯客户端行为。
 */

import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDesktopStore } from "#/stores/windows";

const MIN_W = 400;
const MIN_H = 300;

interface WindowProps {
	tabId: number;
	windowId: string;
	title: string;
	children: ReactNode;
	defaultSize?: { w: number; h: number };
	onClose?: () => void;
}

export function Window({
	tabId,
	windowId,
	title,
	children,
	defaultSize = { w: 640, h: 400 },
	onClose,
}: WindowProps) {
	const { t } = useTranslation();
	const win = useDesktopStore((s) => s.windowsByTab[tabId]?.[windowId]);
	const openWindow = useDesktopStore((s) => s.openWindow);
	const focusWindow = useDesktopStore((s) => s.focusWindow);
	const minimizeWindow = useDesktopStore((s) => s.minimizeWindow);
	const toggleMaximize = useDesktopStore((s) => s.toggleMaximize);
	const closeWindow = useDesktopStore((s) => s.closeWindow);
	const dragStart = useRef<{
		x: number;
		y: number;
		ox: number;
		oy: number;
	} | null>(null);

	// 窗口未在 store 注册时打开（调用方也可主动 openWindow 预设位置）
	useEffect(() => {
		if (!win) {
			openWindow(tabId, windowId, {
				x: 80,
				y: 60,
				w: defaultSize.w,
				h: defaultSize.h,
			});
		}
	}, [win, tabId, windowId, defaultSize.w, defaultSize.h, openWindow]);

	if (!win) return null;

	const startDrag = (e: ReactPointerEvent) => {
		e.preventDefault();
		focusWindow(tabId, windowId);
		dragStart.current = { x: e.clientX, y: e.clientY, ox: win.x, oy: win.y };
		const onMove = (ev: PointerEvent) => {
			if (!dragStart.current) return;
			moveWindow(ev, tabId, windowId);
		};
		const onUp = () => {
			dragStart.current = null;
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	const moveWindow = (ev: PointerEvent, tid: number, wid: string) => {
		const start = dragStart.current;
		if (!start) return;
		useDesktopStore.getState().moveWindow(tid, wid, {
			x: start.ox + ev.clientX - start.x,
			y: start.oy + ev.clientY - start.y,
		});
	};

	const startResize = (e: ReactPointerEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const ox = win.w;
		const oy = win.h;
		const sx = e.clientX;
		const sy = e.clientY;
		const onMove = (ev: PointerEvent) => {
			useDesktopStore.getState().resizeWindow(tabId, windowId, {
				w: Math.max(MIN_W, ox + ev.clientX - sx),
				h: Math.max(MIN_H, oy + ev.clientY - sy),
			});
		};
		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	};

	const handleClose = () => {
		closeWindow(tabId, windowId);
		onClose?.();
	};

	return (
		<div
			className="absolute flex flex-col rounded-xl border shadow-lg"
			style={{
				left: win.x,
				top: win.y,
				width: win.maximized ? "100%" : win.w,
				height: win.maximized ? "100%" : win.h,
				zIndex: win.zIndex,
				background: "var(--bg2)",
				borderColor: "var(--rule)",
				display: win.minimized ? "none" : "flex",
			}}
			onPointerDown={() => focusWindow(tabId, windowId)}
		>
			<div
				className="flex h-8 shrink-0 select-none items-center gap-2 border-b px-3"
				style={{ borderColor: "var(--rule)", cursor: "grab" }}
				onPointerDown={startDrag}
				onDoubleClick={() => toggleMaximize(tabId, windowId)}
			>
				<span
					className="truncate text-sm font-medium"
					style={{ color: "var(--ink)" }}
				>
					{title}
				</span>
				<div className="ml-auto flex items-center gap-1">
					<TitleBarButton
						label={t("window.minimize")}
						onClick={() => minimizeWindow(tabId, windowId)}
					>
						—
					</TitleBarButton>
					<TitleBarButton
						label={t(win.maximized ? "window.restore" : "window.maximize")}
						onClick={() => toggleMaximize(tabId, windowId)}
					>
						{win.maximized ? "❐" : "□"}
					</TitleBarButton>
					<TitleBarButton
						label={t("common.close")}
						onClick={handleClose}
						danger
					>
						✕
					</TitleBarButton>
				</div>
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
			<div
				className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
				onPointerDown={startResize}
			/>
		</div>
	);
}

function TitleBarButton({
	children,
	label,
	onClick,
	danger,
}: {
	children: ReactNode;
	label: string;
	onClick: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className="flex size-6 items-center justify-center rounded text-xs transition-colors"
			style={{
				color: danger ? "var(--danger)" : "var(--muted)",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = "var(--bg3)";
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent";
			}}
		>
			{children}
		</button>
	);
}
