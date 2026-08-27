/**
 * 通用桌面窗口组件（docs 界面设计 §3.6 / docs/06 §7）：标题栏拖拽 / 边缘缩放 / 聚焦置顶 / 最小化 / 最大化。
 * 窗口状态由 Zustand store 管理（决策记录 D10），纯客户端行为；进出场动画走 motion（AnimatePresence 由 Desktop 包裹）。
 */

import {
	RiCloseLine,
	RiFullscreenExitLine,
	RiFullscreenLine,
	RiSubtractLine,
} from "@remixicon/react";
import { motion } from "motion/react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { useDesktopStore } from "#/stores/windows";
import { cn } from "#/utils";

const MIN_W = 400;
const MIN_H = 300;
/** 窗口进出场动效（docs/07 §5：令牌化动效） */
const WINDOW_MOTION = {
	initial: { opacity: 0, scale: 0.96 },
	animate: { opacity: 1, scale: 1 },
	exit: { opacity: 0, scale: 0.96 },
	transition: { duration: 0.18, ease: [0.2, 0, 0, 1] },
} as const;

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
	// 聚焦态：zIndex 为当前 Tab 内最高即聚焦（驱动标题栏高亮与阴影层级）
	const focused = useDesktopStore(
		(s) =>
			win != null &&
			Object.values(s.windowsByTab[tabId] ?? {}).every(
				(w) => w.zIndex <= win.zIndex,
			),
	);
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
		<motion.div
			{...WINDOW_MOTION}
			className={cn(
				"absolute flex flex-col overflow-hidden rounded-xl border bg-card",
				focused
					? "border-border shadow-lg"
					: "border-border/70 shadow-md opacity-95",
			)}
			style={{
				left: win.x,
				top: win.y,
				width: win.maximized ? "100%" : win.w,
				height: win.maximized ? "100%" : win.h,
				zIndex: win.zIndex,
				display: win.minimized ? "none" : "flex",
			}}
			onPointerDown={() => focusWindow(tabId, windowId)}
		>
			{/* 标题栏：聚焦时背景加深（docs/07 §6 焦点态） */}
			<div
				className={cn(
					"flex h-8 shrink-0 select-none items-center gap-2 border-b px-3",
					focused
						? "border-border bg-muted/60"
						: "border-border/70 bg-transparent",
				)}
				style={{ cursor: "grab" }}
				onPointerDown={startDrag}
				onDoubleClick={() => toggleMaximize(tabId, windowId)}
			>
				<span className="truncate text-sm font-medium text-foreground">
					{title}
				</span>
				<div className="ml-auto flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon-xs"
						type="button"
						title={t("window.minimize")}
						aria-label={t("window.minimize")}
						className="text-muted-foreground"
						onClick={(e) => {
							e.stopPropagation();
							minimizeWindow(tabId, windowId);
						}}
					>
						<RiSubtractLine />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						type="button"
						title={t(win.maximized ? "window.restore" : "window.maximize")}
						aria-label={t(win.maximized ? "window.restore" : "window.maximize")}
						className="text-muted-foreground"
						onClick={(e) => {
							e.stopPropagation();
							toggleMaximize(tabId, windowId);
						}}
					>
						{win.maximized ? <RiFullscreenExitLine /> : <RiFullscreenLine />}
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						type="button"
						title={t("common.close")}
						aria-label={t("common.close")}
						className="text-danger hover:bg-danger hover:text-danger-foreground"
						onClick={(e) => {
							e.stopPropagation();
							handleClose();
						}}
					>
						<RiCloseLine />
					</Button>
				</div>
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
			<div
				className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
				onPointerDown={startResize}
			/>
		</motion.div>
	);
}
