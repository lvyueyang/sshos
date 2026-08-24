/**
 * App 远程能力状态条（docs 发行版适配计划 §2/§3）：
 * 按 App manifest 的 remoteRequirements 探测远程工具，渲染可用徽标；
 * 必需工具缺失自动挂载安装引导，增强工具缺失显示「安装」入口（点击展开）。
 * 复用 useRemoteTools（TanStack Query 缓存 + 服务端会话缓存）。
 */

import { useState } from "react";
import type { RemoteToolRequirement } from "#/app-framework/types";
import { useRemoteTools } from "#/hooks/use-remote-tools";
import { InstallGuide } from "./InstallGuide";

interface AppCapabilitiesProps {
	sessionId: string;
	requirements: RemoteToolRequirement[];
}

export function AppCapabilities({
	sessionId,
	requirements,
}: AppCapabilitiesProps) {
	const tools = requirements.map((r) => r.id);
	const { availability, isLoading } = useRemoteTools({
		sessionId,
		tools,
	});
	const [showInstall, setShowInstall] = useState<Record<string, boolean>>({});

	// 必需工具缺失 → 自动挂载安装引导（核心依赖）
	const coreMissing = requirements.filter(
		(r) => !r.optional && availability[r.id] === false,
	);
	// 增强工具缺失 → 显示「安装」提示入口，点击展开引导
	const optionalMissing = requirements.filter(
		(r) => r.optional && availability[r.id] === false,
	);
	// 可用工具 → 绿色徽标
	const available = requirements.filter(
		(r) => r.optional && availability[r.id] === true,
	);

	const noInfo = isLoading && requirements.length > 0;

	return (
		<>
			{/* 必需工具缺失：自动安装引导 */}
			{coreMissing.map((r) => (
				<InstallGuide
					key={r.id}
					sessionId={sessionId}
					requirement={r}
					available={false}
				/>
			))}

			{/* 增强工具：可用徽标 + 缺失安装入口 */}
			{!noInfo && (available.length > 0 || optionalMissing.length > 0) && (
				<div
					className="flex flex-wrap items-center gap-1 border-b px-2 py-1 text-[11px]"
					style={{ borderColor: "var(--rule)" }}
				>
					{available.map((r) => (
						<span
							key={r.id}
							className="rounded px-1.5 py-0.5"
							style={{ background: "var(--ok-bg)", color: "var(--ok)" }}
							title={r.neededFor.join(" / ")}
						>
							✓ {r.label}
						</span>
					))}
					{optionalMissing.map((r) => (
						<button
							key={r.id}
							type="button"
							onClick={() =>
								setShowInstall((s) => ({ ...s, [r.id]: !s[r.id] }))
							}
							className="rounded border px-1.5 py-0.5"
							style={{
								borderColor: "var(--rule)",
								color: "var(--muted)",
							}}
						>
							{r.label} 缺失 · 安装
						</button>
					))}
				</div>
			)}

			{/* 增强工具缺失：点击展开的安装引导 */}
			{optionalMissing
				.filter((r) => showInstall[r.id])
				.map((r) => (
					<InstallGuide
						key={r.id}
						sessionId={sessionId}
						requirement={r}
						available={false}
					/>
				))}
		</>
	);
}
