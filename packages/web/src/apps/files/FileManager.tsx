/**
 * 文件管理器窗口（docs 界面设计 §5 / W2）：SFTP 目录浏览 + 右键操作 + 上传下载。
 * 目录列表走 TanStack Query（key = sessionId + cwd），增删改后 invalidate 刷新。
 * 右键菜单 / 各操作对话框拆到 FileManagerMenu 与 file-dialogs；用户手动写操作
 * 不经策略引擎（连接器本质），直接走 SFn 执行。
 */

import {
	RiArrowLeftLine,
	RiFileLine,
	RiFolder2Line,
	RiFolderAddLine,
	RiHome5Line,
	RiLink,
	RiRefreshLine,
	RiUpload2Line,
} from "@remixicon/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppCapabilities } from "#/components/AppCapabilities";
import { Button } from "#/components/ui/button";
import { Progress } from "#/components/ui/progress";
import { Separator } from "#/components/ui/separator";
import { Skeleton } from "#/components/ui/skeleton";
import { apiFetch, authHeaders } from "#/lib/api-fetch";
import { formatBytes, formatTime } from "#/lib/format";
import type { FileInfo } from "#/services/ssh/sftp/sftp-manager";
import { manifest } from "./app";
import {
	FileManagerMenu,
	type MenuAction,
	type MenuItem,
} from "./FileManagerMenu";
import { DeleteConfirmDialog, MkdirDialog, RenameDialog } from "./file-dialogs";
import { isDirectory } from "./file-utils";
import {
	sftpDeleteSFn,
	sftpListSFn,
	sftpMkdirSFn,
	sftpRenameSFn,
} from "./files.functions";

interface FileManagerProps {
	sessionId: string;
}

/** 上传任务：进度 0-100，错误时携带 message */
export interface UploadTask {
	filename: string;
	progress: number;
	error?: string;
}

export function FileManager({ sessionId }: FileManagerProps) {
	const queryClient = useQueryClient();
	const [cwd, setCwd] = useState("/");
	const [menu, setMenu] = useState<{
		x: number;
		y: number;
		item: MenuItem;
	} | null>(null);
	const [dialog, setDialog] = useState<
		| { type: "rename"; item: MenuItem }
		| { type: "mkdir" }
		| { type: "delete"; item: MenuItem }
		| null
	>(null);
	const [uploads, setUploads] = useState<UploadTask[]>([]);
	const [message, setMessage] = useState<string | null>(null);

	const { data: entries = [], isLoading } = useQuery({
		queryKey: ["sftp", sessionId, cwd],
		queryFn: () => sftpListSFn({ data: { sessionId, path: cwd } }),
		staleTime: 5_000,
	});

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ["sftp", sessionId, cwd] });
	};

	/** 刷新并短暂展示反馈 */
	const flash = (text: string) => {
		setMessage(text);
		setTimeout(() => setMessage(null), 2_500);
	};

	const deleteMutation = useMutation({
		mutationFn: (path: string) => sftpDeleteSFn({ data: { sessionId, path } }),
		onSuccess: () => {
			refresh();
			flash("已删除");
		},
		onError: (err) => flash(`删除失败: ${(err as Error).message}`),
	});

	const renameMutation = useMutation({
		mutationFn: (payload: { oldPath: string; newPath: string }) =>
			sftpRenameSFn({ data: { sessionId, ...payload } }),
		onSuccess: () => {
			refresh();
			flash("已重命名");
		},
		onError: (err) => flash(`重命名失败: ${(err as Error).message}`),
	});

	const mkdirMutation = useMutation({
		mutationFn: (path: string) => sftpMkdirSFn({ data: { sessionId, path } }),
		onSuccess: () => {
			refresh();
			flash("目录已创建");
		},
	});

	/** 进入子目录（双击目录行） */
	const enterDir = (path: string) => {
		setCwd(path);
		setMenu(null);
	};

	/** 处理右键菜单动作：打开/下载直接执行，重命名/删除弹确认框 */
	const handleAction = (action: MenuAction, item: MenuItem) => {
		setMenu(null);
		switch (action.type) {
			case "open":
				enterDir(item.path);
				break;
			case "download":
				void downloadFile(sessionId, item.path, item.name).catch((err) =>
					flash(`下载失败: ${(err as Error).message}`),
				);
				break;
			case "rename":
				setDialog({ type: "rename", item });
				break;
			case "delete":
				setDialog({ type: "delete", item });
				break;
		}
	};

	return (
		<div className="flex h-full flex-col bg-transparent text-sm">
			{/* 工具栏 */}
			<div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
				<Button
					variant="ghost"
					size="xs"
					type="button"
					onClick={() => parentOf(cwd) && enterDir(parentOf(cwd)!)}
				>
					<RiArrowLeftLine /> 后退
				</Button>
				<Button
					variant="ghost"
					size="xs"
					type="button"
					onClick={() => enterDir("/")}
				>
					<RiHome5Line /> 主页
				</Button>
				<Button variant="ghost" size="xs" type="button" onClick={refresh}>
					<RiRefreshLine /> 刷新
				</Button>
				<Button
					variant="ghost"
					size="xs"
					type="button"
					onClick={() => setDialog({ type: "mkdir" })}
				>
					<RiFolderAddLine /> 新建目录
				</Button>
				<Separator orientation="vertical" className="mx-1 h-4" />
				<label
					className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs text-foreground transition-colors hover:bg-accent"
					title="上传文件"
				>
					<RiUpload2Line className="size-3.5" />
					上传
					<input
						type="file"
						multiple
						className="hidden"
						onChange={(e) => {
							const files = Array.from(e.target.files ?? []);
							void uploadFiles(sessionId, cwd, files, setUploads, refresh);
							e.target.value = "";
						}}
					/>
				</label>
				{message && (
					<span className="ml-auto text-xs text-success">{message}</span>
				)}
			</div>

			{/* 远程能力状态条：探测 rsync/zip/unzip/tar，缺失时提供安装引导 */}
			<AppCapabilities
				sessionId={sessionId}
				requirements={manifest.remoteRequirements ?? []}
			/>

			{/* 路径栏 */}
			<div className="shrink-0 px-2 py-1">
				<div className="flex items-center gap-1 text-xs text-muted-foreground">
					<span className="truncate">{cwd}</span>
				</div>
			</div>

			{/* 列头 */}
			<div className="grid shrink-0 grid-cols-[1fr_100px_120px_80px] gap-2 border-b border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
				<span>名称</span>
				<span className="text-right">大小</span>
				<span>修改时间</span>
				<span>权限</span>
			</div>

			{/* 列表 */}
			<div
				className="min-h-0 flex-1 overflow-y-auto"
				onContextMenu={(e) => {
					if (menu) {
						e.preventDefault();
						setMenu(null);
					}
				}}
			>
				{isLoading && (
					<div className="space-y-1 p-2">
						{[0, 1, 2, 3, 4].map((i) => (
							<div key={i} className="flex items-center gap-2 px-2 py-1.5">
								<Skeleton className="size-4 shrink-0 rounded" />
								<Skeleton className="h-3.5 flex-1" />
								<Skeleton className="h-3.5 w-12" />
							</div>
						))}
					</div>
				)}
				{cwd !== "/" && (
					<Row
						item={{
							name: "..",
							path: parentOf(cwd)!,
							type: "directory",
							size: 0,
							mode: "",
							mtime: 0,
						}}
						onOpen={() => enterDir(parentOf(cwd)!)}
						onMenu={() => {}}
					/>
				)}
				{entries.map((entry) => (
					<Row
						key={entry.path}
						item={entry}
						onOpen={() => isDirectory(entry) && enterDir(entry.path)}
						onMenu={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setMenu({
								x: e.clientX,
								y: e.clientY,
								item: { name: entry.name, path: entry.path, type: entry.type },
							});
						}}
					/>
				))}
				{entries.length === 0 && !isLoading && (
					<div className="p-3 text-xs text-muted-foreground">空目录</div>
				)}
			</div>

			{/* 上传队列 */}
			{uploads.length > 0 && (
				<div className="shrink-0 space-y-1 border-t border-border p-2">
					{uploads.map((u) => (
						<div key={u.filename} className="flex items-center gap-2 text-xs">
							<span className="w-40 truncate text-foreground">
								{u.filename}
							</span>
							{u.error ? (
								<span className="text-danger">{u.error}</span>
							) : (
								<>
									<Progress value={u.progress} className="h-1.5 flex-1" />
									<span className="text-muted-foreground tabular-nums">
										{u.progress}%
									</span>
								</>
							)}
						</div>
					))}
				</div>
			)}

			{/* 右键菜单 */}
			{menu && (
				<FileManagerMenu
					x={menu.x}
					y={menu.y}
					item={menu.item}
					onClose={() => setMenu(null)}
					onAction={(action) => handleAction(action, menu.item)}
				/>
			)}

			{/* 操作对话框 */}
			{dialog?.type === "rename" && (
				<RenameDialog
					item={dialog.item}
					onConfirm={(newName) => {
						void renameMutation.mutateAsync({
							oldPath: dialog.item.path,
							newPath: joinName(dialog.item.path, newName),
						});
						setDialog(null);
					}}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.type === "mkdir" && (
				<MkdirDialog
					cwd={cwd}
					onConfirm={(name) => {
						mkdirMutation.mutate(joinPath(cwd, name));
						setDialog(null);
					}}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog?.type === "delete" && (
				<DeleteConfirmDialog
					item={dialog.item}
					onConfirm={() => {
						deleteMutation.mutate(dialog.item.path);
						setDialog(null);
					}}
					onClose={() => setDialog(null)}
				/>
			)}
		</div>
	);
}

/** 目录行 / 文件行 */
function Row({
	item,
	onOpen,
	onMenu,
}: {
	item: FileInfo;
	onOpen: () => void;
	onMenu: (e: React.MouseEvent) => void;
}) {
	return (
		<div
			className="grid grid-cols-[1fr_100px_120px_80px] gap-2 px-2 py-1 text-foreground transition-colors hover:bg-muted"
			onDoubleClick={onOpen}
			onContextMenu={onMenu}
			title={item.path}
		>
			<span className="flex items-center gap-1.5 truncate">
				<span>{iconFor(item)}</span>
				<span className="truncate">{item.name}</span>
			</span>
			<span className="text-right text-muted-foreground">
				{isDirectory(item) ? "" : formatBytes(item.size)}
			</span>
			<span className="text-muted-foreground">{formatTime(item.mtime)}</span>
			<span className="truncate text-muted-foreground">{item.mode}</span>
		</div>
	);
}

/** 父目录路径；已是根则返回 null */
function parentOf(path: string): string | null {
	if (path === "/") return null;
	const trimmed = path.replace(/\/+$/, "");
	const idx = trimmed.lastIndexOf("/");
	if (idx <= 0) return "/";
	return trimmed.slice(0, idx);
}

/** 拼接目录与名字（保持 / 分隔） */
function joinPath(dir: string, name: string): string {
	return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

/** 重命名目标路径：取选中项父目录 + 新名字 */
function joinName(oldPath: string, newName: string): string {
	const parent = oldPath.slice(0, oldPath.lastIndexOf("/") + 1);
	return `${parent}${newName}`;
}

/** 目录 / 文件图标（Remix，docs/07 §4） */
function iconFor(item: FileInfo): React.ReactNode {
	if (item.type === "directory") {
		return <RiFolder2Line className="size-4 text-app-files" />;
	}
	if (item.type === "link") {
		return <RiLink className="size-4 text-info" />;
	}
	return <RiFileLine className="size-4 text-muted-foreground" />;
}

/** 触发浏览器下载远程文件（Server Route 直通） */
async function downloadFile(sessionId: string, path: string, filename: string) {
	const res = await apiFetch(
		`/api/sftp/download?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(path)}`,
	);
	if (!res.ok) throw new Error(`下载失败: ${res.status}`);
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** 批量上传文件：逐个走 /api/sftp/upload 流式写入，XHR 提供进度 */
async function uploadFiles(
	sessionId: string,
	dirPath: string,
	files: File[],
	setUploads: (fn: (prev: UploadTask[]) => UploadTask[]) => void,
	refresh: () => void,
) {
	for (const file of files) {
		const xhr = new XMLHttpRequest();
		xhr.open(
			"POST",
			`/api/sftp/upload?sessionId=${encodeURIComponent(sessionId)}&dirPath=${encodeURIComponent(dirPath)}&filename=${encodeURIComponent(file.name)}`,
		);
		// 全局鉴权（D19）：XHR 同样携带 token
		for (const [k, v] of Object.entries(authHeaders())) {
			xhr.setRequestHeader(k, v);
		}
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) {
				const progress = Math.round((e.loaded / e.total) * 100);
				setUploads((prev) =>
					prev.map((u) => (u.filename === file.name ? { ...u, progress } : u)),
				);
			}
		};
		xhr.onload = () => {
			if (xhr.status === 200) {
				setUploads((prev) => prev.filter((u) => u.filename !== file.name));
				refresh();
			} else {
				setUploads((prev) =>
					prev.map((u) =>
						u.filename === file.name
							? { ...u, error: `上传失败 (${xhr.status})` }
							: u,
					),
				);
			}
		};
		xhr.onerror = () => {
			setUploads((prev) =>
				prev.map((u) =>
					u.filename === file.name ? { ...u, error: "网络错误" } : u,
				),
			);
		};
		setUploads((prev) => [...prev, { filename: file.name, progress: 0 }]);
		xhr.send(file);
	}
}
