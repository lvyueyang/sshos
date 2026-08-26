/**
 * 文件管理器操作对话框（docs/07 §3）：新建目录 / 重命名用 shadcn Dialog，删除确认用 shadcn AlertDialog。
 * 确认后回调由 FileManager 调对应 SFn（写操作自动过 Policy Engine）。
 */

import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { MenuItem } from "./FileManagerMenu";

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
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>新建目录</DialogTitle>
				</DialogHeader>
				<div className="grid gap-1.5 py-2">
					<Label htmlFor="mkdir-name" className="text-muted-foreground">
						在 {cwd} 下创建
					</Label>
					<Input
						id="mkdir-name"
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) =>
							e.key === "Enter" && name.trim() && onConfirm(name.trim())
						}
						placeholder="目录名"
					/>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						取消
					</Button>
					<Button
						type="button"
						disabled={!name.trim()}
						onClick={() => onConfirm(name.trim())}
					>
						创建
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
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
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>重命名</DialogTitle>
				</DialogHeader>
				<div className="grid gap-1.5 py-2">
					<Label htmlFor="rename-name" className="text-muted-foreground">
						新名称
					</Label>
					<Input
						id="rename-name"
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) =>
							e.key === "Enter" && name.trim() && onConfirm(name.trim())
						}
					/>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						取消
					</Button>
					<Button
						type="button"
						disabled={!name.trim()}
						onClick={() => onConfirm(name.trim())}
					>
						确定
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** 删除确认：目录递归删除提示（写操作，过 Policy Engine） */
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
		<AlertDialog open onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>确认删除</AlertDialogTitle>
					<AlertDialogDescription>
						确定删除{isFolder ? "目录（递归）" : "文件"}
						<code className="mx-1 rounded bg-muted px-1 font-mono text-foreground">
							{item.path}
						</code>
						？该操作完成后不可撤销。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={onClose}>取消</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
