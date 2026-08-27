/**
 * 系统指标服务：基于 SSH exec 通道的采样执行器 + MetricsCollector 单例。
 * Server Route（api/metrics.$sessionId）直接消费快照流。
 */

import { execCommand } from "../../ssh/connection/ssh.server";
import { MetricsCollector, type SampleExecutor } from "./metrics-collector";

/** 通过 SSH exec 通道执行命令并返回完整 stdout */
const sampleExecutor: SampleExecutor = {
	exec: (sessionId, command) => execCommand(sessionId, command),
};

/** 指标采集器单例（每 2s 采样，见 docs 技术架构 §5.5） */
export const metricsCollector = new MetricsCollector(sampleExecutor, {
	intervalMs: 2_000,
});
