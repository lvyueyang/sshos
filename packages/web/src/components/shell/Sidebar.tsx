/**
 * 侧栏：SSH 连接管理器（docs 界面设计 §2.2-2.4 / docs/07 §3）。
 * 分组树展示连接列表，支持搜索过滤、新建/编辑连接、dnd 排序、点击连接打开桌面 Tab。
 * 视觉走 shadcn + Remix 图标 + 语义 token（P1 迁移）。
 */

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	RiAddLine,
	RiDeleteBin6Line,
	RiDraggable,
	RiEdit2Line,
	RiFolder2Line,
	RiFolderAddLine,
	RiSearchLine,
	RiSettings4Line,
	RiTerminalLine,
} from "@remixicon/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type ConnectionStatus,
	StatusDot,
} from "#/components/shared/StatusDot";
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
import { useConnect } from "#/hooks/use-connect";
import { cn } from "#/lib/utils";
import {
	createGroupSFn,
	deleteGroupSFn,
	listConnectionsSFn,
	listGroupsSFn,
	reorderConnectionsSFn,
	reorderGroupsSFn,
	updateGroupSFn,
} from "#/services/settings/connections/settings.functions";
import { useSettingsUiStore } from "#/stores/settings-ui";
import { type ConnectionPrefill, useUiStore } from "#/stores/ui";
import { useDesktopStore } from "#/stores/windows";
import { ConnectionDrawer } from "../ConnectionDrawer";

const DEFAULT_GROUP_ID = "group:default";
const DROP_GROUP_PREFIX = "drop-group:";

type Group = Awaited<ReturnType<typeof listGroupsSFn>>[number];
type Connection = Awaited<ReturnType<typeof listConnectionsSFn>>[number];

export function Sidebar() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const [drawer, setDrawer] = useState<
		| { mode: "create" }
		| { mode: "create"; prefill: ConnectionPrefill }
		| { mode: "edit"; connectionId: number }
		| null
	>(null);
	const [groupDialog, setGroupDialog] = useState<
		{ mode: "create" } | { mode: "edit"; group: Group } | null
	>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);

	// 消费首页空状态 / ssh:// 深链的新建连接信号，唤起抽屉（带预填）后归零
	const connectionDrawerSignal = useUiStore((s) => s.connectionDrawerSignal);
	const consumeNewConnection = useUiStore((s) => s.consumeNewConnection);
	useEffect(() => {
		if (connectionDrawerSignal > 0) {
			const prefill = consumeNewConnection();
			setDrawer(prefill ? { mode: "create", prefill } : { mode: "create" });
		}
	}, [connectionDrawerSignal, consumeNewConnection]);

	const tabs = useDesktopStore((s) => s.tabs);
	const { connectConnection } = useConnect();

	const { data: connections = [] } = useQuery({
		queryKey: ["connections"],
		queryFn: () => listConnectionsSFn(),
	});
	const { data: groups = [] } = useQuery({
		queryKey: ["groups"],
		queryFn: () => listGroupsSFn(),
	});

	const filtered = search
		? connections.filter(
				(c) =>
					c.title.toLowerCase().includes(search.toLowerCase()) ||
					c.host.includes(search),
			)
		: connections;

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: ["connections"] });
		void queryClient.invalidateQueries({ queryKey: ["groups"] });
	};

	const handleDragEnd = async ({ active, over }: DragEndEvent) => {
		if (!over || search) return;
		setActionError(null);
		const activeId = String(active.id);
		const overId = String(over.id);
		if (activeId.startsWith("group:")) {
			const activeGroupId = Number(activeId.slice(6));
			if (!Number.isInteger(activeGroupId) || overId === DEFAULT_GROUP_ID)
				return;
			const overGroupId = overId.startsWith("group:")
				? Number(overId.slice(6))
				: overId.startsWith(DROP_GROUP_PREFIX)
					? Number(overId.slice(DROP_GROUP_PREFIX.length))
					: connections.find(
							(connection) => `connection:${connection.id}` === overId,
						)?.groupId;
			if (
				overGroupId == null ||
				!Number.isInteger(overGroupId) ||
				activeGroupId === overGroupId
			)
				return;
			const ids = groups.map((group) => group.id);
			const from = ids.indexOf(activeGroupId);
			const to = ids.indexOf(overGroupId);
			if (from < 0 || to < 0) return;
			ids.splice(from, 1);
			ids.splice(to, 0, activeGroupId);
			await reorderGroupsSFn({ data: { ids } });
			refresh();
			return;
		}

		if (!activeId.startsWith("connection:")) return;
		const connectionId = Number(activeId.slice(11));
		const source = connections.find(
			(connection) => connection.id === connectionId,
		);
		if (!source) return;
		const targetGroupId = overId.startsWith("group:")
			? overId === DEFAULT_GROUP_ID
				? null
				: Number(overId.slice(6))
			: overId.startsWith(DROP_GROUP_PREFIX)
				? overId === `${DROP_GROUP_PREFIX}default`
					? null
					: Number(overId.slice(DROP_GROUP_PREFIX.length))
				: (connections.find(
						(connection) => `connection:${connection.id}` === overId,
					)?.groupId ?? null);
		const targetConnections = connections
			.filter(
				(connection) =>
					connection.groupId === targetGroupId &&
					connection.id !== connectionId,
			)
			.map((connection) => connection.id);
		const overConnectionId = overId.startsWith("connection:")
			? Number(overId.slice(11))
			: undefined;
		if (overConnectionId === connectionId) return;
		const targetIndex = overConnectionId
			? targetConnections.indexOf(overConnectionId)
			: -1;
		targetConnections.splice(
			targetIndex < 0 ? targetConnections.length : targetIndex,
			0,
			connectionId,
		);
		await reorderConnectionsSFn({
			data: { groupId: targetGroupId, connectionIds: targetConnections },
		});
		refresh();
	};
	const handleDragError = (error: unknown) => {
		setActionError(error instanceof Error ? error.message : "排序失败");
		refresh();
	};

	return (
		<aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
			{/* Logo */}
			<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
				<div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<RiTerminalLine className="size-3.5" />
				</div>
				<span className="text-sm font-semibold text-foreground">
					{t("app.name")}
				</span>
			</div>

			{/* 搜索 */}
			<div className="p-3">
				<div className="relative">
					<RiSearchLine className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("common.search")}
						className="pl-8"
					/>
				</div>
			</div>

			{/* 连接树 */}
			<div className="min-h-0 flex-1 overflow-y-auto px-2">
				{actionError && (
					<div
						className="mb-2 rounded-md border border-danger-border bg-danger-soft px-2 py-1 text-xs text-danger"
						role="alert"
					>
						{actionError}
					</div>
				)}
				{connections.length === 0 && groups.length === 0 ? (
					<EmptyState onCreate={() => setDrawer({ mode: "create" })} />
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={(event) =>
							void handleDragEnd(event).catch(handleDragError)
						}
					>
						<SortableContext
							items={groups.map((group) => `group:${group.id}`)}
							strategy={verticalListSortingStrategy}
						>
							<div className="space-y-3 pb-3">
								{groups.map((group) => (
									<SortableGroup
										key={group.id}
										group={group}
										connections={filtered.filter(
											(connection) => connection.groupId === group.id,
										)}
										tabs={tabs}
										onOpen={(connection) =>
											void connectConnection(connection.id, connection.title)
										}
										onEditConnection={(connection) =>
											setDrawer({ mode: "edit", connectionId: connection.id })
										}
										onEditGroup={() => setGroupDialog({ mode: "edit", group })}
										onDeleteGroup={async () => {
											if (!window.confirm(`删除分组“${group.name}”？`)) return;
											try {
												setActionError(null);
												await deleteGroupSFn({ data: { id: group.id } });
												refresh();
											} catch (error) {
												handleDragError(error);
											}
										}}
									/>
								))}
								<SortableGroup
									group={{ id: null, name: "默认", color: null }}
									connections={filtered.filter(
										(connection) => connection.groupId == null,
									)}
									tabs={tabs}
									onOpen={(connection) =>
										void connectConnection(connection.id, connection.title)
									}
									onEditConnection={(connection) =>
										setDrawer({ mode: "edit", connectionId: connection.id })
									}
								/>
							</div>
						</SortableContext>
					</DndContext>
				)}
			</div>

			{/* 底部操作区 */}
			<div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
				<Button
					type="button"
					onClick={() => setDrawer({ mode: "create" })}
					className="flex-1"
				>
					<RiAddLine className="size-4" />
					{t("sidebar.newConnection")}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					title="新建分组"
					aria-label="新建分组"
					onClick={() => setGroupDialog({ mode: "create" })}
				>
					<RiFolderAddLine className="size-4" />
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					title={t("sidebar.settings")}
					aria-label={t("sidebar.settings")}
					onClick={() => useSettingsUiStore.getState().openSettings()}
				>
					<RiSettings4Line className="size-4" />
				</Button>
			</div>

			{drawer && (
				<ConnectionDrawer
					mode={drawer.mode}
					prefill={"prefill" in drawer ? drawer.prefill : undefined}
					connectionId={
						drawer.mode === "edit" ? drawer.connectionId : undefined
					}
					onClose={() => setDrawer(null)}
					onSaved={() => {
						setDrawer(null);
						void queryClient.invalidateQueries({ queryKey: ["connections"] });
						void queryClient.invalidateQueries({ queryKey: ["groups"] });
					}}
				/>
			)}
			{groupDialog && (
				<GroupDialog
					mode={groupDialog.mode}
					group={groupDialog.mode === "edit" ? groupDialog.group : undefined}
					onClose={() => setGroupDialog(null)}
					onSaved={() => {
						setGroupDialog(null);
						refresh();
					}}
				/>
			)}
		</aside>
	);
}

/** connectionStatus：按已打开 Tab 反查连接状态（未开 Tab = offline） */
function connectionStatus(
	connectionId: number,
	tabs: Array<{ connectionId: number; status: ConnectionStatus }>,
): ConnectionStatus {
	const tab = tabs.find((t) => t.connectionId === connectionId);
	return tab?.status ?? "offline";
}

/** 分组：可排序（分组拖拽排序）+ 可投放（连接拖入该组） */
function SortableGroup({
	group,
	connections,
	tabs,
	onOpen,
	onEditConnection,
	onEditGroup,
	onDeleteGroup,
}: {
	group: { id: number | null; name: string; color: string | null };
	connections: Connection[];
	tabs: Array<{ connectionId: number; status: ConnectionStatus }>;
	onOpen: (connection: Connection) => void;
	onEditConnection: (connection: Connection) => void;
	onEditGroup?: () => void;
	onDeleteGroup?: () => void;
}) {
	const sortable = useSortable({
		id: `group:${group.id ?? "default"}`,
		disabled: group.id === null,
	});
	const drop = useDroppable({
		id: `${DROP_GROUP_PREFIX}${group.id ?? "default"}`,
	});
	const style =
		group.id === null
			? undefined
			: {
					transform: CSS.Transform.toString(sortable.transform),
					transition: sortable.transition,
				};
	const visibleIds = connections.map(
		(connection) => `connection:${connection.id}`,
	);
	return (
		<div ref={sortable.setNodeRef} style={style}>
			<GroupHeader
				name={group.name}
				count={connections.length}
				color={group.color ?? undefined}
				onEdit={onEditGroup}
				onDelete={onDeleteGroup}
				dragHandleProps={
					group.id === null
						? undefined
						: {
								ref: sortable.setActivatorNodeRef,
								...sortable.attributes,
								...sortable.listeners,
							}
				}
			/>
			<div
				ref={drop.setNodeRef}
				className={cn(
					"rounded-md border border-transparent py-0.5 transition-colors",
					drop.isOver && "border-primary bg-primary/5",
				)}
			>
				<SortableContext
					items={visibleIds}
					strategy={verticalListSortingStrategy}
				>
					{connections.map((connection) => (
						<SortableConnection
							key={connection.id}
							connection={connection}
							status={connectionStatus(connection.id, tabs)}
							onOpen={() => onOpen(connection)}
							onEdit={() => onEditConnection(connection)}
						/>
					))}
				</SortableContext>
				{connections.length === 0 && (
					<div className="mx-1 min-h-8 rounded border border-dashed border-border px-2 py-2 text-center text-[10px] text-muted-foreground">
						拖到这里移动连接
					</div>
				)}
			</div>
		</div>
	);
}

/** 连接项：可排序（组内拖拽排序） */
function SortableConnection({
	connection,
	status,
	onOpen,
	onEdit,
}: {
	connection: Connection;
	status: ConnectionStatus;
	onOpen: () => void;
	onEdit: () => void;
}) {
	const sortable = useSortable({ id: `connection:${connection.id}` });
	return (
		<div
			ref={sortable.setNodeRef}
			style={{
				transform: CSS.Transform.toString(sortable.transform),
				transition: sortable.transition,
			}}
		>
			<ConnectionItem
				connection={connection}
				status={status}
				onOpen={onOpen}
				onEdit={onEdit}
				dragHandleProps={{
					ref: sortable.setActivatorNodeRef,
					...sortable.attributes,
					...sortable.listeners,
				}}
			/>
		</div>
	);
}

/** 分组标题行：拖拽手柄 + 分组色条 + 名称/计数 + 编辑/删除（hover 显示） */
function GroupHeader({
	name,
	count,
	color,
	onEdit,
	onDelete,
	dragHandleProps,
}: {
	name: string;
	count: number;
	color?: string;
	onEdit?: () => void;
	onDelete?: () => void;
	dragHandleProps?: Record<string, unknown>;
}) {
	return (
		<div className="group/header flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted">
			<span
				className="cursor-grab select-none text-muted-foreground/50 active:cursor-grabbing"
				aria-hidden="true"
				style={{ touchAction: "none" }}
				{...dragHandleProps}
			>
				<RiDraggable className="size-3.5" />
			</span>
			<RiFolder2Line
				className="size-3.5 shrink-0"
				style={color ? { color } : undefined}
			/>
			<span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				{name}
			</span>
			<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
				{count}
			</span>
			<div className="ml-auto flex items-center gap-0.5">
				{onEdit && (
					<Button
						variant="ghost"
						size="icon-xs"
						type="button"
						title="编辑分组"
						aria-label="编辑分组"
						className="text-muted-foreground opacity-0 transition-opacity group-hover/header:opacity-100"
						onClick={(event) => {
							event.stopPropagation();
							onEdit();
						}}
					>
						<RiEdit2Line className="size-3" />
					</Button>
				)}
				{onDelete && (
					<Button
						variant="ghost"
						size="icon-xs"
						type="button"
						title="删除分组"
						aria-label="删除分组"
						className="text-danger opacity-0 transition-opacity group-hover/header:opacity-100 hover:text-danger"
						onClick={(event) => {
							event.stopPropagation();
							onDelete();
						}}
					>
						<RiDeleteBin6Line className="size-3" />
					</Button>
				)}
			</div>
		</div>
	);
}

/** 新建 / 编辑分组对话框（shadcn Dialog） */
function GroupDialog({
	mode,
	group,
	onClose,
	onSaved,
}: {
	mode: "create" | "edit";
	group?: Group;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [name, setName] = useState(group?.name ?? "");
	const [color, setColor] = useState(group?.color ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const handleSave = async () => {
		setSaving(true);
		setError(null);
		try {
			if (mode === "create") {
				await createGroupSFn({
					data: { name: name.trim(), color: color || undefined },
				});
			} else if (group) {
				await updateGroupSFn({
					data: { id: group.id, name: name.trim(), color: color || undefined },
				});
			}
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : "保存分组失败");
		} finally {
			setSaving(false);
		}
	};
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "新建分组" : "编辑分组"}
					</DialogTitle>
				</DialogHeader>
				<div className="grid gap-4 py-2">
					<div className="grid gap-1.5">
						<Label htmlFor="group-name">名称</Label>
						<Input
							id="group-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="group-color">颜色</Label>
						<input
							id="group-color"
							type="color"
							value={color || "#6e7781"}
							onChange={(e) => setColor(e.target.value)}
							className="h-8 w-full"
						/>
					</div>
					{error && <p className="text-sm text-danger">{error}</p>}
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						取消
					</Button>
					<Button
						type="button"
						disabled={saving}
						onClick={() => void handleSave()}
					>
						{saving ? "保存中…" : "保存"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** 连接项：状态灯 + 名称/主机 + hover 编辑（左侧品牌色高亮条） */
function ConnectionItem({
	connection,
	status,
	onOpen,
	onEdit,
	dragHandleProps,
}: {
	connection: { id: number; title: string; host: string; username: string };
	status: ConnectionStatus;
	onOpen: () => void;
	onEdit: () => void;
	dragHandleProps?: Record<string, unknown>;
}) {
	return (
		<div
			className="group flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-l-2 border-transparent px-2 py-1.5 pl-3.5 transition-colors hover:border-primary hover:bg-muted"
			onClick={onOpen}
		>
			<span
				className="cursor-grab select-none text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
				aria-hidden="true"
				style={{ touchAction: "none" }}
				{...dragHandleProps}
			>
				<RiDraggable className="size-3.5" />
			</span>
			<StatusDot status={status} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm text-foreground">
					{connection.title}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{connection.host}
				</div>
			</div>
			<Button
				variant="ghost"
				size="icon-xs"
				type="button"
				title="编辑"
				aria-label="编辑"
				className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
				}}
			>
				<RiEdit2Line className="size-3" />
			</Button>
		</div>
	);
}

/** 空状态：首次使用引导新建第一个连接（docs/03 §4.4） */
function EmptyState({ onCreate }: { onCreate: () => void }) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			onClick={onCreate}
			className="m-2 flex w-[calc(100%-16px)] flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
		>
			<div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted">
				<RiAddLine className="size-4" />
			</div>
			<div className="text-sm">{t("sidebar.addFirstConnection")}</div>
			<div className="text-xs">{t("sidebar.supportsAuth")}</div>
		</button>
	);
}
