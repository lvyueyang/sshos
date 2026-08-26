/**
 * 侧栏：SSH 连接管理器（docs 界面设计 §2.2-2.4）。
 * 分组树展示连接列表，支持搜索过滤、新建/编辑连接、点击连接打开桌面 Tab。
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnect } from "#/hooks/use-connect";
import {
	createGroupSFn,
	deleteGroupSFn,
	listConnectionsSFn,
	listGroupsSFn,
	reorderConnectionsSFn,
	reorderGroupsSFn,
	updateGroupSFn,
} from "#/services/settings/settings.functions";
import { useSettingsUiStore } from "#/stores/settings-ui";
import { type ConnectionPrefill, useUiStore } from "#/stores/ui";
import { useDesktopStore } from "#/stores/windows";
import { ConnectionDrawer } from "./ConnectionDrawer";

const DEFAULT_GROUP_ID = "group:default";
const DROP_GROUP_PREFIX = "drop-group:";

type Group = Awaited<ReturnType<typeof listGroupsSFn>>[number];
type Connection = Awaited<ReturnType<typeof listConnectionsSFn>>[number];

/** 连接状态灯 */
function StatusDot({
	status,
}: {
	status: "online" | "offline" | "connecting" | "error";
}) {
	const color =
		status === "online"
			? "var(--accent)"
			: status === "connecting"
				? "var(--warn)"
				: status === "error"
					? "var(--danger)"
					: "var(--muted)";
	return (
		<span
			className="inline-block size-2 rounded-full"
			style={{
				background: color,
				animation: status === "connecting" ? "pulse 1s infinite" : undefined,
			}}
		/>
	);
}

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
		<aside
			className="flex w-72 shrink-0 flex-col border-r"
			style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
		>
			{/* Logo */}
			<div
				className="flex h-12 shrink-0 items-center gap-2 px-4"
				style={{ borderBottom: "1px solid var(--rule)" }}
			>
				<div
					className="flex size-6 items-center justify-center rounded text-xs font-bold text-white"
					style={{ background: "var(--accent)" }}
				>
					S
				</div>
				<span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
					{t("app.name")}
				</span>
			</div>

			{/* 搜索 */}
			<div className="p-3">
				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={t("common.search")}
					className="w-full rounded border bg-transparent px-2 py-1 text-sm outline-none"
					style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
				/>
			</div>

			{/* 连接树 */}
			<div className="min-h-0 flex-1 overflow-y-auto px-2">
				{actionError && (
					<div
						className="mb-2 rounded border px-2 py-1 text-xs"
						style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
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
			<div
				className="flex shrink-0 items-center gap-2 border-t p-3"
				style={{ borderColor: "var(--rule)" }}
			>
				<button
					type="button"
					onClick={() => setDrawer({ mode: "create" })}
					className="flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white"
					style={{ background: "var(--accent)" }}
				>
					+ {t("sidebar.newConnection")}
				</button>
				<button
					type="button"
					title="新建分组"
					onClick={() => setGroupDialog({ mode: "create" })}
					className="flex size-8 items-center justify-center rounded-md border text-sm"
					style={{ color: "var(--muted)", borderColor: "var(--rule)" }}
				>
					+
				</button>
				<button
					type="button"
					title={t("sidebar.settings")}
					aria-label={t("sidebar.settings")}
					onClick={() => useSettingsUiStore.getState().openSettings()}
					className="flex size-8 items-center justify-center rounded-md text-sm"
					style={{ color: "var(--muted)", border: "1px solid var(--rule)" }}
				>
					⚙
				</button>
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

function connectionStatus(
	connectionId: number,
	tabs: Array<{
		connectionId: number;
		status: "connecting" | "online" | "offline" | "error";
	}>,
): "online" | "offline" | "connecting" | "error" {
	const tab = tabs.find((t) => t.connectionId === connectionId);
	return tab?.status ?? "offline";
}

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
	tabs: Array<{
		connectionId: number;
		status: "connecting" | "online" | "offline" | "error";
	}>;
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
				className={`rounded-md border border-transparent py-0.5 transition-colors ${
					drop.isOver
						? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
						: ""
				}`}
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
					<div
						className="mx-1 min-h-8 rounded border border-dashed px-2 py-2 text-center text-[10px]"
						style={{ borderColor: "var(--rule)" }}
					>
						拖到这里移动连接
					</div>
				)}
			</div>
		</div>
	);
}

function SortableConnection({
	connection,
	status,
	onOpen,
	onEdit,
}: {
	connection: Connection;
	status: "online" | "offline" | "connecting" | "error";
	onOpen: () => void;
	onEdit: () => void;
}) {
	const sortable = useSortable({ id: `connection:${connection.id}` });
	return (
		<div
			ref={sortable.setNodeRef}
			className="group/connection"
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
	dragHandleProps?: Record<string, unknown>;
	onDelete?: () => void;
}) {
	return (
		<div
			className="group/header flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--bg3)]"
			style={{ color: "var(--muted)" }}
		>
			<span
				className="cursor-grab select-none text-[13px] leading-none opacity-50 active:cursor-grabbing"
				aria-hidden="true"
				style={{ touchAction: "none" }}
				{...dragHandleProps}
			>
				⋮⋮
			</span>
			<span
				className="h-4 w-0.5 rounded-full"
				style={{ background: color ?? "var(--muted)" }}
			/>
			<span
				className="text-[11px] font-semibold uppercase tracking-wide"
				style={{ color: "var(--muted)" }}
			>
				{name}
			</span>
			<span
				className="rounded-full bg-[var(--bg3)] px-1.5 py-0.5 text-[10px] tabular-nums"
				style={{ color: "var(--muted)" }}
			>
				{count}
			</span>
			{onEdit && (
				<button
					type="button"
					title="编辑分组"
					onClick={(event) => {
						event.stopPropagation();
						onEdit();
					}}
					className="ml-auto rounded px-1.5 py-0.5 text-xs opacity-0 transition-opacity group-hover/header:opacity-100 hover:bg-[var(--bg)]"
					style={{ color: "var(--muted)" }}
				>
					✎
				</button>
			)}
			{onDelete && (
				<button
					type="button"
					title="删除分组"
					onClick={(event) => {
						event.stopPropagation();
						onDelete();
					}}
					className="rounded px-1.5 py-0.5 text-xs opacity-0 transition-opacity group-hover/header:opacity-100 hover:bg-[var(--bg)]"
					style={{ color: "var(--danger)" }}
				>
					×
				</button>
			)}
		</div>
	);
}

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
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: "rgba(0,0,0,0.6)" }}
			onClick={onClose}
		>
			<div
				className="w-80 rounded-lg border p-5"
				style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
				onClick={(event) => event.stopPropagation()}
			>
				<h2
					className="mb-4 text-lg font-semibold"
					style={{ color: "var(--ink)" }}
				>
					{mode === "create" ? "新建分组" : "编辑分组"}
				</h2>
				<label className="mb-3 block text-sm" style={{ color: "var(--muted)" }}>
					名称
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						className="mt-1 w-full rounded border bg-transparent px-2 py-1.5 outline-none"
						style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
					/>
				</label>
				<label className="mb-3 block text-sm" style={{ color: "var(--muted)" }}>
					颜色
					<input
						type="color"
						value={color || "#6e7781"}
						onChange={(event) => setColor(event.target.value)}
						className="mt-1 block h-8 w-full"
					/>
				</label>
				{error && (
					<div className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
						{error}
					</div>
				)}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded border px-3 py-1.5 text-sm"
						style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
					>
						取消
					</button>
					<button
						type="button"
						onClick={() => void handleSave()}
						disabled={saving}
						className="rounded px-3 py-1.5 text-sm text-white disabled:opacity-50"
						style={{ background: "var(--accent)" }}
					>
						{saving ? "保存中…" : "保存"}
					</button>
				</div>
			</div>
		</div>
	);
}

function ConnectionItem({
	connection,
	status,
	onOpen,
	onEdit,
	dragHandleProps,
}: {
	connection: { id: number; title: string; host: string; username: string };
	status: "online" | "offline" | "connecting" | "error";
	onOpen: () => void;
	onEdit: () => void;
	dragHandleProps?: Record<string, unknown>;
}) {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			className="group flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 pl-4 transition-colors"
			style={{
				background: hovered ? "var(--bg3)" : "transparent",
				borderLeft: hovered
					? "2px solid var(--accent2)"
					: "2px solid transparent",
			}}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onClick={onOpen}
		>
			<span
				className="cursor-grab select-none text-xs leading-none opacity-0 transition-opacity group-hover:opacity-50 active:cursor-grabbing"
				aria-hidden="true"
				style={{ touchAction: "none" }}
				{...dragHandleProps}
			>
				⠿
			</span>
			<StatusDot status={status} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm" style={{ color: "var(--ink)" }}>
					{connection.title}
				</div>
				<div className="truncate text-xs" style={{ color: "var(--muted)" }}>
					{connection.host}
				</div>
			</div>
			{hovered && (
				<button
					type="button"
					title="编辑"
					onClick={(e) => {
						e.stopPropagation();
						onEdit();
					}}
					className="rounded px-1 text-xs"
					style={{ color: "var(--muted)" }}
				>
					✎
				</button>
			)}
		</div>
	);
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			onClick={onCreate}
			className="m-2 flex w-[calc(100%-16px)] flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
			style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
		>
			<div className="text-2xl">+</div>
			<div className="text-sm">{t("sidebar.addFirstConnection")}</div>
			<div className="text-xs">{t("sidebar.supportsAuth")}</div>
		</button>
	);
}
