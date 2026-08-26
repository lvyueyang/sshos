/**
 * 认证门：调用 authStatusSFn 判定状态，按未配置 / 未登录 / 已登录
 * 分别渲染 SetupWizard / LoginForm / 应用内容。纯客户端行为（SSR 输出占位）。
 * 已认证（ready）分支才挂载 ThemeProvider——此时 bootstrap 已就绪且已鉴权，
 * 主题持久化恢复（getGlobalSettingSFn）不再被 503/401 吞掉（D24 修复）。
 */

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { getAuthToken } from "#/lib/auth-client";
import { authStatusSFn } from "#/services/auth/auth.functions";
import { ThemeProvider } from "#/theme/theme-provider";
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
			const { configured, authenticated } = await authStatusSFn({
				data: { token: getAuthToken() ?? null },
			});
			if (authenticated) setState({ phase: "ready" });
			else if (configured) setState({ phase: "unauth" });
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
	// ready：主题恢复 + 持久化仅在已认证后生效（见文件头注释）
	return <ThemeProvider>{children}</ThemeProvider>;
}
