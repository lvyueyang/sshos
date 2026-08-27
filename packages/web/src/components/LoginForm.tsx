/**
 * 登录表单：服务端已配置启动密码后显示，调用 loginSFn 登录，
 * 成功写入 token 进入桌面。视觉走 shadcn Card/Input/Button（docs/07 §3）。
 */

import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { setAuthToken } from "#/lib/auth-client/auth-client";
import { loginSFn } from "#/services/auth/auth.functions";

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
			const { token } = await loginSFn({ data: { password } });
			setAuthToken(token);
			onDone();
		} catch (err) {
			setError(
				err instanceof Error && err.message === "invalid credentials"
					? t("auth.wrongPassword")
					: t("auth.loginFailed"),
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
					{t("auth.loginTitle")}
				</h1>
				<div className="grid gap-1.5">
					<Label htmlFor="login-pass">{t("auth.password")}</Label>
					<Input
						id="login-pass"
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder={t("auth.password")}
						autoFocus
					/>
				</div>
				{error && <p className="text-sm text-danger">{error}</p>}
				<Button type="submit" disabled={submitting}>
					{submitting ? t("auth.loggingIn") : t("auth.loginSubmit")}
				</Button>
			</form>
		</main>
	);
}
