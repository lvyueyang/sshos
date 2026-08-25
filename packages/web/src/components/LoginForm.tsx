/**
 * 登录表单：服务端已配置启动密码后显示，登录成功写入 token 进入桌面。
 */

import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { setAuthToken } from "#/lib/auth-client";

export function LoginForm({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent): Promise<void> {
		event.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password }),
			});
			const data = (await res.json()) as { token?: string; error?: string };
			if (!res.ok || !data.token) {
				setError(
					data.error === "invalid credentials"
						? t("auth.wrongPassword")
						: (data.error ?? t("auth.loginFailed")),
				);
				return;
			}
			setAuthToken(data.token);
			onDone();
		} catch {
			setError(t("auth.networkError"));
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
					{t("auth.loginTitle")}
				</h1>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder={t("auth.password")}
					autoFocus
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
					{submitting ? t("auth.loggingIn") : t("auth.loginSubmit")}
				</button>
			</form>
		</main>
	);
}
