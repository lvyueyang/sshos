/**
 * 侧栏：SSH 连接管理器（docs 界面设计 §2.2-2.4）。
 * 分组树展示连接列表，支持搜索过滤、新建/编辑连接、点击连接打开桌面 Tab。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnect } from "#/hooks/use-connect";
import {
	listConnectionsSFn,
	listGroupsSFn,
} from "#/services/settings/settings.functions";
import { type ConnectionPrefill, useUiStore } from "#/stores/ui";
import { useDesktopStore } from "#/stores/windows";
import { ConnectionDrawer } from "./ConnectionDrawer";

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

	return (
		<aside
			className="flex w-60 shrink-0 flex-col border-r"
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
				{connections.length === 0 ? (
					<EmptyState onCreate={() => setDrawer({ mode: "create" })} />
				) : (
					<div className="space-y-3 pb-3">
						{groups.map((group) => {
							const groupConns = filtered.filter((c) => c.groupId === group.id);
							if (groupConns.length === 0) return null;
							return (
								<div key={group.id}>
									<GroupHeader
										name={group.name}
										count={groupConns.length}
										color={group.color ?? undefined}
									/>
									{groupConns.map((c) => (
										<ConnectionItem
											key={c.id}
											connection={c}
											status={connectionStatus(c.id, tabs)}
											onOpen={() => void connectConnection(c.id, c.title)}
											onEdit={() =>
												setDrawer({ mode: "edit", connectionId: c.id })
											}
										/>
									))}
								</div>
							);
						})}
						{filtered
							.filter((c) => c.groupId == null)
							.map((c) => (
								<ConnectionItem
									key={c.id}
									connection={c}
									status={connectionStatus(c.id, tabs)}
									onOpen={() => void connectConnection(c.id, c.title)}
									onEdit={() => setDrawer({ mode: "edit", connectionId: c.id })}
								/>
							))}
					</div>
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

function GroupHeader({
	name,
	count,
	color,
}: {
	name: string;
	count: number;
	color?: string;
}) {
	return (
		<div className="flex items-center gap-1.5 px-1 py-1">
			<span
				className="h-3 w-0.5 rounded"
				style={{ background: color ?? "var(--muted)" }}
			/>
			<span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
				{name}
			</span>
			<span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
				{count}
			</span>
		</div>
	);
}

function ConnectionItem({
	connection,
	status,
	onOpen,
	onEdit,
}: {
	connection: { id: number; title: string; host: string; username: string };
	status: "online" | "offline" | "connecting" | "error";
	onOpen: () => void;
	onEdit: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			className="group flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5"
			style={{ background: hovered ? "var(--bg3)" : "transparent" }}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onClick={onOpen}
		>
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
