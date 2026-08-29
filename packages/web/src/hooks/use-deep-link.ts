/**
 * ssh:// 深链消费 hook（docs 界面设计 §4.6 / 决策记录 D11）：
 * 桌面壳冷启动经 URL 参数 ?deeplink= 注入深链（壳的本地职责，不经过服务端 API），
 * 本 hook 读取并清理后分发——命中已保存连接则连接（聚焦已有 Tab），
 * 否则预填新建连接抽屉由用户补全认证信息。
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { listConnectionsSFn } from "#/services/settings/connections/settings.functions";
import { useUiStore } from "#/stores/ui";
import { useConnect } from "./use-connect";

/** 解析 ssh:// 深链，返回 host/port/username（缺失字段为空串 / 默认端口；IPv6 去方括号） */
export function parseSshDeepLink(url: string): {
	host: string;
	port: number;
	username: string;
} {
	try {
		const u = new URL(url);
		// Node 的 URL.hostname 对 IPv6 返回带方括号的 "[::1]"，与已保存连接的 host 需一致，去掉括号
		const host = (u.hostname || "").replace(/^\[|\]$/g, "");
		const port = u.port ? Number(u.port) : 22;
		const username = u.username || "";
		return { host, port, username };
	} catch {
		return { host: "", port: 22, username: "" };
	}
}

/** 从 URL 读取并消费深链（读后清理参数，避免刷新重复消费） */
function consumeDeepLink(): string | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	const raw = params.get("deeplink");
	if (!raw) return null;
	params.delete("deeplink");
	const qs = params.toString();
	const search = qs ? `?${qs}` : "";
	window.history.replaceState(
		null,
		"",
		`${window.location.pathname}${search}${window.location.hash}`,
	);
	return raw;
}

/** 挂载时 + 窗口聚焦时消费深链并分发 */
export function useDeepLink(): void {
	const queryClient = useQueryClient();
	const { connectConnection } = useConnect();
	const requestNewConnection = useUiStore((s) => s.requestNewConnection);
	const handle = useCallback(async () => {
		try {
			const raw = consumeDeepLink();
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
				await connectConnection(match);
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
		} catch (err) {
			// 消费失败（server 瞬时不可达等）不阻塞；下次 focus 会重试
			console.error("深链消费失败:", err);
		}
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
