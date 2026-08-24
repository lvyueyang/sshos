/**
 * @sshos/core 统一出口：SSH / PTY / SFTP / 指标采集各管理器与共享类型
 */

export {
	buildDistroProfile,
	type CoreutilsFlavor,
	clearAllDistroProfiles,
	clearDistroProfile,
	DISTRO_PROBE_CMD,
	type DistroExecutor,
	type DistroFamily,
	type DistroProbeResult,
	type DistroProfile,
	detectRemoteDistro,
	getCachedDistroProfile,
	getOrDetectDistroProfile,
	type InitSystem,
	type PackageManager,
	parseDistroProbe,
	parseOsRelease,
	splitDistroProbe,
} from "./distro-profile";
export {
	type CpuSample,
	computeCpuUsage,
	computeNetRates,
	MetricsCollector,
	type NetSample,
	parseDfK,
	parseProcMeminfo,
	parseProcNetDev,
	parseProcStat,
	type SampleExecutor,
	splitSample,
} from "./metrics-collector";
export { PtyManager, PtySessionError } from "./pty-manager";
export { SftpManager, SftpSessionError } from "./sftp-manager";
export { SshManager, SshSessionError } from "./ssh-manager";
export * from "./types";
