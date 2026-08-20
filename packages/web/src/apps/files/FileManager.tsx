/**
 * 文件管理器窗口（docs 界面设计 §5 / W2）：SFTP 目录浏览 + 右键操作 + 上传下载。
 * 目录列表走 TanStack Query（key = sessionId + cwd），增删改后 invalidate 刷新。
 * 右键菜单 / 各操作对话框拆到 FileManagerMenu 与 file-dialogs；写操作一律走 SFn（过 Policy Engine）。
 */

import type { FileInfo } from "@sshos/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	approvalSFn,
	listPendingApprovalsSFn,
} from "#/approval/approval.functions";
import {
	ApprovalDialog,
	type PendingApproval,
} from "#/components/ApprovalDialog";
import {
	FileManagerMenu,
	type MenuAction,
	type MenuItem,
} from "./FileManagerMenu";
import { DeleteConfirmDialog, MkdirDialog, RenameDialog } from "./file-dialogs";
import { formatBytes, formatTime, isDirectory } from "./file-utils";
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
	const [approval, setApproval] = useState<PendingApproval | null>(null);

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

	/** 写操作被策略引擎 review 拦截后：查询本会话挂起审批并弹窗 */
	const handlePolicyIntercept = async () => {
		try {
			const pending = await listPendingApprovalsSFn({ data: { sessionId } });
			if (pending.length > 0) setApproval(pending[0]);
		} catch {
			// 查询失败不阻塞：提示拦截即可
		}
		flash("操作被策略引擎拦截，等待审批");
	};

	/** 审批决策：批准（服务端重放执行）或拒绝，随后刷新列表 */
	const decideApproval = async (decision: "approved" | "rejected") => {
		if (!approval) return;
		await approvalSFn({ data: { requestId: approval.requestId, decision } });
		refresh();
		flash(decision === "approved" ? "已批准执行" : "已拒绝");
	};

	const deleteMutation = useMutation({
		mutationFn: (path: string) => sftpDeleteSFn({ data: { sessionId, path } }),
		onSuccess: () => {
			refresh();
			flash("已删除");
		},
		onError: () => void handlePolicyIntercept(),
	});

	const renameMutation = useMutation({
		mutationFn: (payload: { oldPath: string; newPath: string }) =>
			sftpRenameSFn({ data: { sessionId, ...payload } }),
		onSuccess: () => {
			refresh();
			flash("已重命名");
		},
		onError: () => void handlePolicyIntercept(),
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
			<div
				className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
				style={{ borderColor: "var(--rule)" }}
			>
				<ToolButton
					label="后退"
					onClick={() => parentOf(cwd) && enterDir(parentOf(cwd)!)}
				/>
				<ToolButton label="主页" onClick={() => enterDir("/")} />
				<ToolButton label="刷新" onClick={refresh} />
				<ToolButton
					label="新建目录"
					onClick={() => setDialog({ type: "mkdir" })}
				/>
				<div className="mx-1 h-4 w-px" style={{ background: "var(--rule)" }} />
				<label
					className="cursor-pointer rounded px-2 py-1 hover:bg-white/10"
					title="上传文件"
				>
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
					<span className="ml-auto text-xs" style={{ color: "var(--accent)" }}>
						{message}
					</span>
				)}
			</div>

			{/* 路径栏 */}
			<div className="shrink-0 px-2 py-1">
				<div
					className="flex items-center gap-1 text-xs"
					style={{ color: "var(--muted)" }}
				>
					<span className="truncate">{cwd}</span>
				</div>
			</div>

			{/* 列头 */}
			<div
				className="grid shrink-0 grid-cols-[1fr_100px_120px_80px] gap-2 border-b px-2 py-1 text-xs"
				style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
			>
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
					<div className="p-3 text-xs" style={{ color: "var(--muted)" }}>
						加载中…
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
					<div className="p-3 text-xs" style={{ color: "var(--muted)" }}>
						空目录
					</div>
				)}
			</div>

			{/* 上传队列 */}
			{uploads.length > 0 && (
				<div
					className="shrink-0 space-y-1 border-t p-2"
					style={{ borderColor: "var(--rule)" }}
				>
					{uploads.map((u) => (
						<div key={u.filename} className="flex items-center gap-2 text-xs">
							<span className="w-40 truncate" style={{ color: "var(--ink)" }}>
								{u.filename}
							</span>
							{u.error ? (
								<span style={{ color: "var(--danger)" }}>{u.error}</span>
							) : (
								<>
									<div
										className="h-1.5 flex-1 overflow-hidden rounded"
										style={{ background: "var(--bg3)" }}
									>
										<div
											className="h-full transition-all"
											style={{
												width: `${u.progress}%`,
												background: "var(--accent)",
											}}
										/>
									</div>
									<span style={{ color: "var(--muted)" }}>{u.progress}%</span>
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

			{/* 审批弹窗（review 级写操作被策略引擎挂起时弹出） */}
			{approval && (
				<ApprovalDialog
					approval={approval}
					onDecision={(decision) => decideApproval(decision)}
					onClose={() => setApproval(null)}
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
			className="grid grid-cols-[1fr_100px_120px_80px] gap-2 px-2 py-1"
			style={{ color: "var(--ink)" }}
			onDoubleClick={onOpen}
			onContextMenu={onMenu}
			title={item.path}
		>
			<span className="flex items-center gap-1.5 truncate">
				<span>{iconFor(item)}</span>
				<span className="truncate">{item.name}</span>
			</span>
			<span className="text-right" style={{ color: "var(--muted)" }}>
				{isDirectory(item) ? "" : formatBytes(item.size)}
			</span>
			<span style={{ color: "var(--muted)" }}>{formatTime(item.mtime)}</span>
			<span className="truncate" style={{ color: "var(--muted)" }}>
				{item.mode}
			</span>
		</div>
	);
}

function ToolButton({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="rounded px-2 py-1 text-xs hover:bg-white/10"
			style={{ color: "var(--ink)" }}
		>
			{label}
		</button>
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

/** 目录 / 文件图标（emoji 占位，后续换 icon 组件） */
function iconFor(item: FileInfo): string {
	if (item.type === "directory") return "📁";
	if (item.type === "link") return "🔗";
	return "📄";
}

/** 触发浏览器下载远程文件（Server Route 直通） */
async function downloadFile(sessionId: string, path: string, filename: string) {
	const res = await fetch(
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
