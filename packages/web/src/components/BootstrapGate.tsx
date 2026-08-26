/**
 * 初始化载入门（bootstrap）：轮询 bootstrapStatusSFn，running 时显示初始化载入界面
 * （开机动画），ready 后进入内容（AuthGate）；服务 fail-fast 退出（轮询持续失败）时
 * 显示启动失败提示与重新加载入口。视觉走语义 token（docs/07 §2）。
 */

import { RiLoader4Line } from "@remixicon/react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "#/components/ui/button";
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
			<main className="flex h-full items-center justify-center [background:var(--desktop-bg)]">
				<div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-md">
					<h1 className="text-lg font-bold text-foreground">
						{t("bootstrap.failed")}
					</h1>
					<Button type="button" onClick={() => window.location.reload()}>
						{t("bootstrap.reload")}
					</Button>
				</div>
			</main>
		);
	}
	return (
		<main className="flex h-full items-center justify-center [background:var(--desktop-bg)]">
			<div className="flex flex-col items-center gap-4">
				<RiLoader4Line className="size-10 animate-spin text-primary" />
				<p className="text-sm text-muted-foreground">
					{t("bootstrap.initializing")}
				</p>
			</div>
		</main>
	);
}
