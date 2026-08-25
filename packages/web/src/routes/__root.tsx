/**
 * 根路由：应用外壳。桌面 Tab 范式下路由不承载功能页面（决策记录 D1），
 * 功能全部由桌面内窗口 / 面板承载。
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AuthGate } from "#/components/AuthGate";
import { BootstrapGate } from "#/components/BootstrapGate";
import { SettingsWindow } from "#/components/SettingsWindow";
import { Sidebar } from "#/components/Sidebar";
import { loadPersistedTheme } from "#/components/settings/GeneralSettingsPanel";
import { TabBar } from "#/components/TabBar";
import { useDesktopStore } from "#/stores/windows";
import "#/lib/i18n";
import "../globals.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "SSH OS" },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			{/* 初始化载入门：bootstrap 完成后进入认证门（D21） */}
			<BootstrapGate>
				{/* 认证门：未配置显示设置向导 / 未登录显示登录表单 / 已登录进入桌面（D21） */}
				<AuthGate>
					<AppShell />
				</AuthGate>
			</BootstrapGate>
		</RootDocument>
	);
}

/** 应用外壳：左侧连接侧栏 + 右侧 Tab 栏与桌面内容区（docs 界面设计 §2.1） */
function AppShell() {
	// 启动后恢复持久化主题（appearance.theme），未配置保持默认 dark
	useEffect(() => {
		void loadPersistedTheme();
	}, []);

	return (
		<div className="flex h-full overflow-hidden">
			<Sidebar />
			<div className="flex min-w-0 flex-1 flex-col">
				<TabBar />
				<main className="min-h-0 flex-1">
					<Outlet />
				</main>
			</div>
			{/* 系统设置全局浮层（不绑定 Tab，z 高于桌面） */}
			<SettingsWindow />
		</div>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	// 主题偏好由桌面 store 驱动，切换只改根元素 class（SSR 首屏取 store 初始值 dark）
	const theme = useDesktopStore((s) => s.theme);
	const [queryClient] = useState(() => new QueryClient());
	return (
		<html className={theme} lang="zh-CN">
			<head>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}
