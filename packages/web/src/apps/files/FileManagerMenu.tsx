/**
 * 文件管理器右键菜单（docs 界面设计 §5 / D15）：
 * 组件级菜单，动作一律走 SFn（写操作自动过 Policy Engine，无绕过路径）。
 * 菜单项与 files 应用 manifest 的 contributes.contextMenus 声明保持一致。
 */

import { useEffect } from "react";

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
	const items: Array<{ label: string; action: MenuAction; danger?: boolean }> =
		[
			...(isFolder
				? [{ label: "打开", action: { type: "open" as const } }]
				: []),
			{ label: "下载", action: { type: "download" } },
			{ label: "重命名", action: { type: "rename" } },
			{ label: "删除", action: { type: "delete" }, danger: true },
		];

	return (
		<div
			className="fixed z-50 min-w-[140px] overflow-hidden rounded-md border py-1 shadow-lg"
			style={{
				background: "var(--bg2)",
				borderColor: "var(--rule)",
				left: x,
				top: y,
			}}
			onClick={(e) => e.stopPropagation()}
		>
			{items.map((it) => (
				<button
					key={it.label}
					type="button"
					onClick={() => onAction(it.action)}
					className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-white/10"
					style={{ color: it.danger ? "var(--danger)" : "var(--ink)" }}
				>
					{it.label}
				</button>
			))}
		</div>
	);
}
