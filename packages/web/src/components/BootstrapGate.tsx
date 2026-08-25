/**
 * 初始化载入门（bootstrap）：轮询 bootstrapStatusSFn，running 时显示初始化载入界面
 * （开机动画），ready 后进入内容（AuthGate）；服务 fail-fast 退出（轮询持续失败）时
 * 显示启动失败提示与重新加载入口。
 */

import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bootstrapStatusSFn } from "#/services/bootstrap/bootstrap.functions";

type GateState = "loading" | "ready" | "failed";

const POLL_INTERVAL = 500;
const MAX_FAILURES = 10;

export function BootstrapGate({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const [state, setState] = useState<GateState>("loading");

	useEffect(() => {
		let cancelled = false;
		let failures = 0;

		async function poll(): Promise<void> {
			while (!cancelled) {
				try {
					const { phase } = await bootstrapStatusSFn();
					if (phase === "ready") {
						if (!cancelled) setState("ready");
						return;
					}
					failures = 0;
				} catch {
					// 服务 fail-fast 退出后轮询会持续失败，累计到阈值判为启动失败
					failures += 1;
					if (failures >= MAX_FAILURES) {
						if (!cancelled) setState("failed");
						return;
					}
				}
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
			}
		}
		void poll();
		return () => {
			cancelled = true;
		};
	}, []);

	if (state === "ready") return <>{children}</>;
	if (state === "failed") {
		return (
			<main
				className="flex h-full items-center justify-center"
				style={{ background: "var(--desktop-bg)" }}
			>
				<div
					className="flex flex-col items-center gap-4 rounded-lg border p-8 text-center"
					style={{ background: "var(--card)", borderColor: "var(--rule)" }}
				>
					<h1 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
						{t("bootstrap.failed")}
					</h1>
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="rounded-md px-4 py-2 text-sm font-medium text-white"
						style={{ background: "var(--accent)" }}
					>
						{t("bootstrap.reload")}
					</button>
				</div>
			</main>
		);
	}
	return (
		<main
			className="flex h-full items-center justify-center"
			style={{ background: "var(--desktop-bg)" }}
		>
			<div className="flex flex-col items-center gap-4">
				<div
					className="size-10 animate-spin rounded-full border-2 border-t-transparent"
					style={{ borderColor: "var(--accent)" }}
				/>
				<p className="text-sm" style={{ color: "var(--muted)" }}>
					{t("bootstrap.initializing")}
				</p>
			</div>
		</main>
	);
}
