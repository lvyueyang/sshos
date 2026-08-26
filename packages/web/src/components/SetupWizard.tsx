/**
 * 首次启动设置向导：服务端未配置（server.json 无启动密码）时显示。
 * 调用 setupSFn 设置密码，服务端生成 JWT 密钥，返回 token 自动登录。
 * 视觉走 shadcn Card/Input/Button（docs/07 §3）。
 */

import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
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
		<main className="flex h-full items-center justify-center [background:var(--desktop-bg)]">
			<form
				onSubmit={(e) => void submit(e)}
				className="flex w-80 flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-md"
			>
				<h1 className="text-lg font-bold text-foreground">
					{t("auth.setupTitle")}
				</h1>
				<p className="text-sm text-muted-foreground">{t("auth.setupHint")}</p>
				<div className="grid gap-1.5">
					<Label htmlFor="setup-pass">{t("auth.password")}</Label>
					<Input
						id="setup-pass"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder={t("auth.password")}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="setup-confirm">{t("auth.confirmPassword")}</Label>
					<Input
						id="setup-confirm"
						type="password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						placeholder={t("auth.confirmPassword")}
					/>
				</div>
				{error && <p className="text-sm text-danger">{error}</p>}
				<Button type="submit" disabled={submitting}>
					{submitting ? t("auth.settingUp") : t("auth.setupSubmit")}
				</Button>
			</form>
		</main>
	);
}
