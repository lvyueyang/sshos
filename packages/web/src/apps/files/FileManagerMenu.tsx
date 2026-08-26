/**
 * 文件管理器右键菜单（docs 界面设计 §6.6）：文件行级浮层菜单（固定定位），
 * 视觉走语义 token + Remix 图标。动作一律走 SFn（写操作自动过 Policy Engine，无绕过路径）。
 */

import {
	RiDeleteBin6Line,
	RiDownload2Line,
	RiEdit2Line,
	RiFolderOpenLine,
} from "@remixicon/react";
import { useEffect } from "react";
import { cn } from "#/lib/utils";

/** 右键菜单作用对象 */
export interface MenuItem {
	name: string;
	path: string;
	type: string;
}

/** 菜单动作：open 进入目录 / download 下载 / rename 重命名 / delete 删除 */
export type MenuAction =
	| { type: "open" }
	| { type: "download" }
	| { type: "rename" }
	| { type: "delete" };

interface FileManagerMenuProps {
	x: number;
	y: number;
	item: MenuItem;
	onClose: () => void;
	onAction: (action: MenuAction) => void;
}

export function FileManagerMenu({
	x,
	y,
	item,
	onClose,
	onAction,
}: FileManagerMenuProps) {
	useEffect(() => {
		const dismiss = () => onClose();
		window.addEventListener("click", dismiss);
		window.addEventListener("resize", dismiss);
		return () => {
			window.removeEventListener("click", dismiss);
			window.removeEventListener("resize", dismiss);
		};
	}, [onClose]);

	const isFolder = item.type === "directory" || item.type === "link";
	const items: Array<{
		label: string;
		action: MenuAction;
		danger?: boolean;
		icon: React.ReactNode;
	}> = [
		...(isFolder
			? [
					{
						label: "打开",
						action: { type: "open" as const },
						icon: <RiFolderOpenLine className="size-3.5" />,
					},
				]
			: []),
		{
			label: "下载",
			action: { type: "download" },
			icon: <RiDownload2Line className="size-3.5" />,
		},
		{
			label: "重命名",
			action: { type: "rename" },
			icon: <RiEdit2Line className="size-3.5" />,
		},
		{
			label: "删除",
			action: { type: "delete" },
			danger: true,
			icon: <RiDeleteBin6Line className="size-3.5" />,
		},
	];

	return (
		<div
			className="fixed z-50 min-w-[150px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
			style={{ left: x, top: y }}
			onClick={(e) => e.stopPropagation()}
		>
			{items.map((it) => (
				<button
					key={it.label}
					type="button"
					onClick={() => onAction(it.action)}
					className={cn(
						"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent",
						it.danger ? "text-danger hover:bg-danger/10" : "text-foreground",
					)}
				>
					{it.icon}
					{it.label}
				</button>
			))}
		</div>
	);
}
