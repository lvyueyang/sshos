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
import { useState } from "react";
import { AuthGate } from "#/components/AuthGate";
import { BootstrapGate } from "#/components/BootstrapGate";
import { SettingsWindow } from "#/components/SettingsWindow";
import { Sidebar } from "#/components/shell/Sidebar";
import { TabBar } from "#/components/shell/TabBar";
import { Toaster } from "#/components/ui/sonner";
import { useThemeStore } from "#/stores/theme";
import "#/i18n";
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
	// 主题四维度由 store 渲染到根元素（SSR 首屏取默认 dark，客户端 hydration 后恢复持久化偏好）
	const scheme = useThemeStore((s) => s.scheme);
	const palette = useThemeStore((s) => s.palette);
	const density = useThemeStore((s) => s.density);
	const fontScale = useThemeStore((s) => s.fontScale);
	const [queryClient] = useState(() => new QueryClient());
	return (
		<html
			className={scheme === "dark" ? "dark" : ""}
			data-theme={palette}
			data-density={density}
			data-font-scale={fontScale}
			lang="zh-CN"
		>
			<head>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					{children}
					{/* 全局 toast（docs/07 §6：反馈必达；主题随 theme store） */}
					<Toaster />
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}
