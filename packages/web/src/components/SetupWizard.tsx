/**
 * 首次启动设置向导：服务端未配置（server.json 无启动密码）时显示。
 * 调用 setupSFn 设置密码，服务端生成 JWT 密钥，返回 token 自动登录。
 */

import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { setAuthToken } from "#/lib/auth-client";
import { setupSFn } from "#/services/auth/auth.functions";

export function SetupWizard({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent): Promise<void> {
		event.preventDefault();
		if (password !== confirm) {
			setError(t("auth.passwordMismatch"));
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const { token } = await setupSFn({ data: { password } });
			setAuthToken(token);
			onDone();
		} catch (err) {
			setError(
				err instanceof Error && err.message === "already configured"
					? t("auth.setupFailed")
					: t("auth.networkError"),
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main
			className="flex h-full items-center justify-center"
			style={{ background: "var(--desktop-bg)" }}
		>
			<form
				onSubmit={(e) => void submit(e)}
				className="flex w-80 flex-col gap-4 rounded-lg border p-6"
				style={{ background: "var(--card)", borderColor: "var(--rule)" }}
			>
				<h1 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
					{t("auth.setupTitle")}
				</h1>
				<p className="text-sm" style={{ color: "var(--muted)" }}>
					{t("auth.setupHint")}
				</p>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder={t("auth.password")}
					className="rounded-md border px-3 py-2 text-sm"
					style={{
						color: "var(--ink)",
						background: "var(--bg2)",
						borderColor: "var(--rule)",
					}}
				/>
				<input
					type="password"
					value={confirm}
					onChange={(e) => setConfirm(e.target.value)}
					placeholder={t("auth.confirmPassword")}
					className="rounded-md border px-3 py-2 text-sm"
					style={{
						color: "var(--ink)",
						background: "var(--bg2)",
						borderColor: "var(--rule)",
					}}
				/>
				{error && (
					<p className="text-sm" style={{ color: "var(--danger)" }}>
						{error}
					</p>
				)}
				<button
					type="submit"
					disabled={submitting}
					className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					style={{ background: "var(--accent)" }}
				>
					{submitting ? t("auth.settingUp") : t("auth.setupSubmit")}
				</button>
			</form>
		</main>
	);
}
