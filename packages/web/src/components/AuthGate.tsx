/**
 * 认证门：挂载时请求 /api/auth/status 判定状态，按未配置 / 未登录 / 已登录
 * 分别渲染 SetupWizard / LoginForm / 应用内容。纯客户端行为（SSR 输出占位）。
 */

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { apiFetch } from "#/lib/api-fetch";
import { LoginForm } from "./LoginForm";
import { SetupWizard } from "./SetupWizard";

type AuthState =
	| { phase: "loading" }
	| { phase: "unconfigured" }
	| { phase: "unauth" }
	| { phase: "ready" };

export function AuthGate({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AuthState>({ phase: "loading" });

	/** 重新探测状态（登录 / 设置成功后刷新） */
	const checkStatus = useCallback(async (): Promise<void> => {
		try {
			const res = await apiFetch("/api/auth/status");
			const data = (await res.json()) as {
				configured: boolean;
				authenticated: boolean;
			};
			if (data.authenticated) setState({ phase: "ready" });
			else if (data.configured) setState({ phase: "unauth" });
			else setState({ phase: "unconfigured" });
		} catch {
			setState({ phase: "unconfigured" });
		}
	}, []);

	useEffect(() => {
		void checkStatus();
	}, [checkStatus]);

	if (state.phase === "loading") return null;
	if (state.phase === "unconfigured") {
		return <SetupWizard onDone={() => void checkStatus()} />;
	}
	if (state.phase === "unauth") {
		return <LoginForm onDone={() => void checkStatus()} />;
	}
	return <>{children}</>;
}
