/**
 * 新建 / 编辑连接抽屉（docs 界面设计 §4.1-4.2）：
 * 右抽屉 420px，遮罩 60%；支持测试连接（5s 超时三色横幅反馈）。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	createConnectionSFn,
	listGroupsSFn,
	testConnectionSFn,
	updateConnectionSFn,
} from "#/services/settings/settings.functions";
import type { ConnectionInput } from "#/services/settings/settings.schemas";
import type { ConnectionPrefill } from "#/stores/ui";

const EMPTY_INPUT: ConnectionInput = {
	title: "",
	host: "",
	port: 22,
	username: "",
	authType: "password",
	password: "",
	groupId: null,
	isProduction: false,
	aiEnabled: true,
};

interface DrawerProps {
	mode: "create" | "edit";
	connectionId?: number;
	/** 新建模式的预填内容（ssh:// 深链解析，docs §4.6） */
	prefill?: ConnectionPrefill;
	onClose: () => void;
	onSaved: () => void;
}

type TestResult = {
	kind: "success" | "failure" | "timeout";
	message: string;
} | null;

export function ConnectionDrawer({
	mode,
	connectionId,
	prefill,
	onClose,
	onSaved,
}: DrawerProps) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	// 新建模式带预填（深链）时直接初始化表单；否则用空表单
	const [form, setForm] = useState<ConnectionInput>(
		mode === "create" && prefill
			? {
					...EMPTY_INPUT,
					title: prefill.title ?? "",
					host: prefill.host ?? "",
					port: prefill.port ?? 22,
					username: prefill.username ?? "",
				}
			: EMPTY_INPUT,
	);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<TestResult>(null);
	const [saving, setSaving] = useState(false);

	const { data: groups = [] } = useQuery({
		queryKey: ["groups"],
		queryFn: () => listGroupsSFn(),
	});

	useEffect(() => {
		if (mode === "edit" && connectionId) {
			// 编辑模式：从列表回填（凭据不回显）
			queryClient
				.fetchQuery({
					queryKey: ["connections"],
					queryFn: () =>
						import("#/services/settings/settings.functions").then((m) =>
							m.listConnectionsSFn(),
						),
				})
				.then((rows) => {
					const c = rows.find((r) => r.id === connectionId);
					if (c) {
						setForm({
							title: c.title,
							host: c.host,
							port: c.port ?? 22,
							username: c.username,
							authType: c.authType,
							password: "",
							groupId: c.groupId,
							color: c.color ?? undefined,
							isProduction: c.isProduction,
							aiEnabled: c.aiEnabled,
						});
					}
				});
		}
	}, [mode, connectionId, queryClient]);

	const set = <K extends keyof ConnectionInput>(
		key: K,
		value: ConnectionInput[K],
	) => setForm((f) => ({ ...f, [key]: value }));

	const handleTest = async () => {
		setTesting(true);
		setTestResult(null);
		try {
			const res = await testConnectionSFn({
				data: {
					host: form.host,
					port: form.port,
					username: form.username,
					authType: form.authType,
					password: form.authType === "password" ? form.password : undefined,
					privateKey:
						form.authType === "privateKey" ? form.privateKey : undefined,
					privateKeyPath: form.privateKeyPath,
					passphrase: form.passphrase,
				},
			});
			if (res.ok) {
				setTestResult({
					kind: "success",
					message: `连接成功 — ${res.os ?? "服务器就绪"}`,
				});
			} else {
				setTestResult({
					kind: /超时/.test(res.message) ? "timeout" : "failure",
					message: res.message,
				});
			}
		} catch {
			setTestResult({
				kind: "timeout",
				message: "连接超时 — 请检查网络和防火墙设置",
			});
		} finally {
			setTesting(false);
		}
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			if (mode === "create") {
				await createConnectionSFn({
					data: { ...form, groupId: form.groupId ?? null },
				});
			} else if (connectionId) {
				await updateConnectionSFn({ data: { id: connectionId, input: form } });
			}
			onSaved();
		} catch (err) {
			console.error("保存连接失败:", err);
		} finally {
			setSaving(false);
		}
	};

	const testColor =
		testResult?.kind === "success"
			? "var(--accent)"
			: testResult?.kind === "timeout"
				? "var(--warn)"
				: "var(--danger)";

	return (
		<div
			className="fixed inset-0 z-50"
			style={{ background: "rgba(0,0,0,0.6)" }}
			onClick={onClose}
		>
			<div
				className="absolute inset-y-0 right-0 w-[420px] overflow-y-auto border-l p-6"
				style={{ background: "var(--bg2)", borderColor: "var(--rule)" }}
				onClick={(e) => e.stopPropagation()}
			>
				<h2
					className="mb-4 text-lg font-semibold"
					style={{ color: "var(--ink)" }}
				>
					{mode === "create"
						? t("sidebar.newConnection")
						: t("connection.edit")}
				</h2>

				<Field label="连接名称">
					<input
						value={form.title}
						onChange={(e) => set("title", e.target.value)}
					/>
				</Field>
				<Field label="主机地址">
					<input
						value={form.host}
						onChange={(e) => set("host", e.target.value)}
					/>
				</Field>
				<Field label="端口">
					<input
						type="number"
						value={form.port}
						onChange={(e) => set("port", Number(e.target.value) || 22)}
					/>
				</Field>
				<Field label="用户名">
					<input
						value={form.username}
						onChange={(e) => set("username", e.target.value)}
					/>
				</Field>
				<Field label="认证方式">
					<select
						value={form.authType}
						onChange={(e) =>
							set("authType", e.target.value as ConnectionInput["authType"])
						}
					>
						<option value="password">密码</option>
						<option value="privateKey">私钥（粘贴）</option>
						<option value="systemKey">系统密钥</option>
						<option value="agent">SSH Agent</option>
					</select>
				</Field>

				{form.authType === "password" && (
					<Field label="密码">
						<input
							type="password"
							value={form.password}
							onChange={(e) => set("password", e.target.value)}
						/>
					</Field>
				)}
				{form.authType === "privateKey" && (
					<>
						<Field label="私钥内容">
							<textarea
								value={form.privateKey}
								onChange={(e) => set("privateKey", e.target.value)}
								rows={4}
							/>
						</Field>
						<Field label="Passphrase">
							<input
								type="password"
								value={form.passphrase}
								onChange={(e) => set("passphrase", e.target.value)}
							/>
						</Field>
					</>
				)}
				{form.authType === "systemKey" && (
					<Field label="系统密钥路径">
						<input
							value={form.privateKeyPath}
							onChange={(e) => set("privateKeyPath", e.target.value)}
							placeholder="~/.ssh/id_ed25519"
						/>
					</Field>
				)}

				<Field label="分组">
					<select
						value={form.groupId ?? ""}
						onChange={(e) =>
							set("groupId", e.target.value ? Number(e.target.value) : null)
						}
					>
						<option value="">（无分组）</option>
						{groups.map((g) => (
							<option key={g.id} value={g.id}>
								{g.name}
							</option>
						))}
					</select>
				</Field>

				<Field label="生产环境标记">
					<input
						type="checkbox"
						checked={form.isProduction}
						onChange={(e) => set("isProduction", e.target.checked)}
					/>
				</Field>

				{testResult && (
					<div
						className="mb-3 rounded border px-3 py-2 text-sm"
						style={{ borderColor: testColor, color: testColor }}
					>
						{testResult.kind === "success" ? "✓ " : "✕ "}
						{testResult.message}
					</div>
				)}

				<div className="mt-4 flex gap-2">
					<button
						type="button"
						onClick={handleTest}
						disabled={testing || !form.host || !form.username}
						className="flex-1 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
						style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
					>
						{testing ? "测试中…" : "测试连接"}
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={saving || !form.title || !form.host || !form.username}
						className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
						style={{ background: "var(--accent)" }}
					>
						{saving ? "保存中…" : t("common.save")}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border px-3 py-2 text-sm"
						style={{ borderColor: "var(--rule)", color: "var(--muted)" }}
					>
						{t("common.cancel")}
					</button>
				</div>
			</div>
		</div>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label className="mb-3 block">
			<span className="mb-1 block text-sm" style={{ color: "var(--muted)" }}>
				{label}
			</span>
			{children}
		</label>
	);
}
