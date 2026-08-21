/**
 * ssh:// 深链消费 hook（docs 界面设计 §4.6 / 决策记录 D11）：
 * 轮询 GET /api/deeplink（Electron main 经 HTTP 注入，渲染层不直连 ipcMain），
 * 解析 ssh://user@host:port 后分发——命中已保存连接则连接（聚焦已有 Tab），
 * 否则预填新建连接抽屉由用户补全认证信息。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { listConnectionsSFn } from "#/services/settings/settings.functions";
import { useUiStore } from "#/stores/ui";
import { useConnect } from "./use-connect";

/** 解析 ssh:// 深链，返回 host/port/username（缺失字段为空串 / 默认端口） */
export function parseSshDeepLink(url: string): {
	host: string;
	port: number;
	username: string;
} {
	try {
		const u = new URL(url);
		const host = u.hostname || "";
		const port = u.port ? Number(u.port) : 22;
		const username = u.username || "";
		return { host, port, username };
	} catch {
		return { host: "", port: 22, username: "" };
	}
}

/** 消费一次深链（GET 后由服务端清空） */
async function fetchDeepLink(): Promise<string | null> {
	const res = await fetch("/api/deeplink");
	if (!res.ok) return null;
	if (res.status === 204) return null;
	const body = (await res.json()) as { url?: string };
	return body.url ?? null;
}

/** 挂载时 + 窗口聚焦时消费深链并分发 */
export function useDeepLink(): void {
	const queryClient = useQueryClient();
	const { connectConnection } = useConnect();
	const requestNewConnection = useUiStore((s) => s.requestNewConnection);

	const handle = useCallback(async () => {
		const raw = await fetchDeepLink();
		if (!raw) return;
		const { host, port, username } = parseSshDeepLink(raw);
		if (!host) return;

		// 命中已保存连接（host + port + username 匹配）→ 直接连接（聚焦已有 Tab）
		const rows = await listConnectionsSFn();
		const match = rows.find(
			(c) =>
				c.host === host && (c.port ?? 22) === port && c.username === username,
		);
		if (match) {
			await connectConnection(match.id, match.title);
			return;
		}
		// 未命中 → 预填新建连接抽屉（host/port/username）
		requestNewConnection({
			title: `${username}@${host}`,
			host,
			port,
			username,
		});
		void queryClient.invalidateQueries({ queryKey: ["connections"] });
	}, [connectConnection, queryClient, requestNewConnection]);

	useEffect(() => {
		void handle();
		const onFocus = () => void handle();
		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onFocus);
		return () => {
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onFocus);
		};
	}, [handle]);
}
