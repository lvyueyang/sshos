/**
 * 文件管理器操作对话框：新建目录 / 重命名 / 删除确认。
 * 确认后回调由 FileManager 调对应 SFn（写操作自动过 Policy Engine）。
 */

import { useState } from "react";
import type { MenuItem } from "./FileManagerMenu";

/** 基础弹层：遮罩 + 居中卡片 */
function Modal({
	title,
	children,
	onClose,
}: {
	title: string;
	children: React.ReactNode;
	onClose: () => void;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: "rgba(0,0,0,0.6)" }}
			onClick={onClose}
		>
			<div
				className="w-80 rounded-lg border p-4"
				style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
				onClick={(e) => e.stopPropagation()}
			>
				<h3
					className="mb-3 text-sm font-semibold"
					style={{ color: "var(--ink)" }}
				>
					{title}
				</h3>
				{children}
			</div>
		</div>
	);
}

/** 新建目录：输入目录名，确认后在当前目录下创建 */
export function MkdirDialog({
	cwd,
	onConfirm,
	onClose,
}: {
	cwd: string;
	onConfirm: (name: string) => void;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	return (
		<Modal title="新建目录" onClose={onClose}>
			<input
				type="text"
				autoFocus
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) =>
					e.key === "Enter" && name.trim() && onConfirm(name.trim())
				}
				placeholder={`在 ${cwd} 下创建`}
				className="mb-3 w-full rounded border px-2 py-1.5 text-sm outline-none"
				style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
			/>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded border px-3 py-1.5 text-xs"
					style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
				>
					取消
				</button>
				<button
					type="button"
					disabled={!name.trim()}
					onClick={() => onConfirm(name.trim())}
					className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
					style={{ background: "var(--accent)" }}
				>
					创建
				</button>
			</div>
		</Modal>
	);
}

/** 重命名：输入新名字（含扩展名） */
export function RenameDialog({
	item,
	onConfirm,
	onClose,
}: {
	item: MenuItem;
	onConfirm: (newName: string) => void;
	onClose: () => void;
}) {
	const [name, setName] = useState(item.name);
	return (
		<Modal title="重命名" onClose={onClose}>
			<input
				type="text"
				autoFocus
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) =>
					e.key === "Enter" && name.trim() && onConfirm(name.trim())
				}
				className="mb-3 w-full rounded border px-2 py-1.5 text-sm outline-none"
				style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
			/>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded border px-3 py-1.5 text-xs"
					style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
				>
					取消
				</button>
				<button
					type="button"
					disabled={!name.trim()}
					onClick={() => onConfirm(name.trim())}
					className="rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
					style={{ background: "var(--accent)" }}
				>
					确定
				</button>
			</div>
		</Modal>
	);
}

/** 删除确认：目录递归删除提示 */
export function DeleteConfirmDialog({
	item,
	onConfirm,
	onClose,
}: {
	item: MenuItem;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const isFolder = item.type === "directory" || item.type === "link";
	return (
		<Modal title="确认删除" onClose={onClose}>
			<p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
				确定删除{isFolder ? "目录（递归）" : "文件"}{" "}
				<span style={{ color: "var(--ink)" }}>{item.path}</span> ？
			</p>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded border px-3 py-1.5 text-xs"
					style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
				>
					取消
				</button>
				<button
					type="button"
					onClick={onConfirm}
					className="rounded px-3 py-1.5 text-xs font-medium text-white"
					style={{ background: "var(--danger)" }}
				>
					删除
				</button>
			</div>
		</Modal>
	);
}
