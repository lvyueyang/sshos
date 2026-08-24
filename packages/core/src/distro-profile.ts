/**
 * 发行版 Profile：SSH 连接后探测远程 Linux 的发行版 / 包管理器 / 初始化系统 / coreutils 风格。
 * 供策略引擎派生包管理器与服务管理规则、software/docker app 选命令、AI 上下文注入。
 * 探测命令为服务端固定只读命令，走直接 exec 路径（不经策略分类），与 metrics 采样一致。
 */

/** 发行版家族（决定包管理器与服务管理风格） */
export type DistroFamily =
	| "debian"
	| "rhel"
	| "arch"
	| "alpine"
	| "suse"
	| "gentoo"
	| "unknown";

/** 支持的包管理器 */
export type PackageManager =
	| "apt"
	| "dnf"
	| "yum"
	| "apk"
	| "pacman"
	| "zypper"
	| "emerge"
	| "snap"
	| "flatpak"
	| "unknown";

/** 初始化系统 */
export type InitSystem = "systemd" | "openrc" | "sysvinit" | "unknown";

/** coreutils 风格（busybox 与 GNU 的工具参数存在差异，如 ps/df） */
export type CoreutilsFlavor = "gnu" | "busybox" | "unknown";

/** 发行版探测结果：供 App 能力探测、安装引导与 AI 上下文使用 */
export interface DistroProfile {
	/** 发行版标识（os-release ID 或探测推断），如 alpine / debian / ubuntu / rocky */
	id: string;
	family: DistroFamily;
	/** 展示名（PRETTY_NAME 等），如 "Alpine Linux v3.20" */
	prettyName?: string;
	packageManager: PackageManager;
	initSystem: InitSystem;
	coreutils: CoreutilsFlavor;
}

/** 探测命令执行器（由 web 层注入，基于 ssh2 exec 通道） */
export interface DistroExecutor {
	exec(sessionId: string, command: string): Promise<string>;
}

/** 分段探测命令：一次通道往返取全部候选文件与工具可用性（仅只读命令） */
export const DISTRO_SEP = "__SSHOS_DISTRO_SEP__";

export const DISTRO_PROBE_CMD = [
	"cat /etc/os-release",
	`echo '${DISTRO_SEP}'`,
	"cat /etc/redhat-release",
	`echo '${DISTRO_SEP}'`,
	"cat /etc/debian_version",
	`echo '${DISTRO_SEP}'`,
	"lsb_release -a",
	`echo '${DISTRO_SEP}'`,
	"command -v dnf",
	"command -v yum",
	"command -v systemctl",
	"command -v rc-service",
	"command -v busybox",
	`echo '${DISTRO_SEP}'`,
	"uname -sr",
].join("; ");

/** 探测原始分段结果（拆分 + 解析后的结构化输入） */
export interface DistroProbeResult {
	osRelease: Record<string, string>;
	redhatRelease: string;
	debianVersion: string;
	lsbText: string;
	tools: {
		dnf: boolean;
		yum: boolean;
		systemctl: boolean;
		rcService: boolean;
		busybox: boolean;
	};
	uname: string;
}

/** 解析 os-release 的 KEY="VALUE" 键值行 */
export function parseOsRelease(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
		if (!m) continue;
		let value = m[2];
		// 去除成对引号（os-release 规范允许单/双引号包裹）
		if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1);
		} else if (
			value.length >= 2 &&
			value.startsWith("'") &&
			value.endsWith("'")
		) {
			value = value.slice(1, -1);
		}
		out[m[1]] = value;
	}
	return out;
}

/** 按分隔符切分探测输出为 os-release / redhat / debian_version / lsb / tools / uname 六段 */
export function splitDistroProbe(text: string): string[] {
	const parts = text.split(new RegExp(`${DISTRO_SEP}\\n?`));
	if (parts.length < 6) {
		throw new Error("无法解析发行版探测输出");
	}
	return parts;
}

/** 由 os-release ID 映射发行版家族与包管理器；RHEL 系包管理器按 dnf/yum 实际可用性确定 */
function familyFromId(id: string): {
	family: DistroFamily;
	packageManager: PackageManager;
} | null {
	switch (id) {
		case "debian":
		case "ubuntu":
		case "linuxmint":
			return { family: "debian", packageManager: "apt" };
		case "rhel":
		case "centos":
		case "rocky":
		case "almalinux":
		case "fedora":
		case "ol":
		case "amzn":
			return { family: "rhel", packageManager: "unknown" };
		case "arch":
		case "manjaro":
		case "endeavouros":
			return { family: "arch", packageManager: "pacman" };
		case "alpine":
			return { family: "alpine", packageManager: "apk" };
		case "opensuse":
		case "opensuse-leap":
		case "opensuse-tumbleweed":
		case "sles":
			return { family: "suse", packageManager: "zypper" };
		case "gentoo":
			return { family: "gentoo", packageManager: "emerge" };
		default:
			return null;
	}
}

/** 由探测分段结果构建完整 Profile */
export function buildDistroProfile(p: DistroProbeResult): DistroProfile {
	let id = "unknown";
	let family: DistroFamily = "unknown";
	let packageManager: PackageManager = "unknown";
	let prettyName: string | undefined = p.osRelease.PRETTY_NAME;

	const osMapped = p.osRelease.ID
		? familyFromId(p.osRelease.ID.toLowerCase())
		: null;
	if (osMapped) {
		id = p.osRelease.ID!.toLowerCase();
		family = osMapped.family;
		packageManager = osMapped.packageManager;
	} else if (p.osRelease.ID) {
		id = p.osRelease.ID.toLowerCase();
	} else if (p.redhatRelease) {
		// 无 os-release 的 RHEL 系老系统
		id = "rhel";
		family = "rhel";
		prettyName ??= p.redhatRelease;
	} else if (p.debianVersion) {
		// 无 os-release 的 Debian 系老系统
		id = "debian";
		family = "debian";
		packageManager = "apt";
		prettyName ??= `Debian ${p.debianVersion}`;
	} else {
		// LSB 兜底（lsb_release -a 输出）
		const lsbId = /Distributor ID:\s*(\S+)/.exec(p.lsbText);
		if (lsbId) {
			id = lsbId[1].toLowerCase();
			const lsbDesc = /Description:\s*(.+)/.exec(p.lsbText);
			prettyName ??= lsbDesc?.[1];
			const mapped = familyFromId(id);
			if (mapped) {
				family = mapped.family;
				packageManager = mapped.packageManager;
			}
		}
	}

	// RHEL 系：现代发行版优先 dnf，兼容老系统的 yum
	if (family === "rhel") {
		packageManager = p.tools.dnf ? "dnf" : p.tools.yum ? "yum" : "unknown";
	}

	// 初始化系统：systemctl 强信号 → systemd；rc-service → OpenRC；两者皆无视为传统 SysVinit
	const initSystem: InitSystem = p.tools.systemctl
		? "systemd"
		: p.tools.rcService
			? "openrc"
			: "sysvinit";
	const coreutils: CoreutilsFlavor = p.tools.busybox ? "busybox" : "gnu";

	return {
		id,
		family,
		packageManager,
		initSystem,
		coreutils,
		...(prettyName ? { prettyName } : {}),
	};
}

/** 解析探测命令输出为 Profile */
export function parseDistroProbe(text: string): DistroProfile {
	const [osRel, redhat, debian, lsb, toolsText, uname] = splitDistroProbe(text);
	return buildDistroProfile({
		osRelease: parseOsRelease(osRel),
		redhatRelease: redhat.trim(),
		debianVersion: debian.trim(),
		lsbText: lsb.trim(),
		tools: {
			dnf: /\bdnf\b/.test(toolsText),
			yum: /\byum\b/.test(toolsText),
			systemctl: /\bsystemctl\b/.test(toolsText),
			rcService: /\brc-service\b/.test(toolsText),
			busybox: /\bbusybox\b/.test(toolsText),
		},
		uname: uname.trim(),
	});
}

/** 按会话缓存（Tab 生命周期绑定，连接断开即清理） */
const profileCache = new Map<string, DistroProfile>();

/** 读缓存 Profile；未探测过返回 undefined */
export function getCachedDistroProfile(
	sessionId: string,
): DistroProfile | undefined {
	return profileCache.get(sessionId);
}

/** 清理会话缓存（会话断开时调用） */
export function clearDistroProfile(sessionId: string): void {
	profileCache.delete(sessionId);
}

/** 清理全部缓存（进程退出 / 测试用） */
export function clearAllDistroProfiles(): void {
	profileCache.clear();
}

/** 探测并缓存会话发行版 Profile；已缓存直接返回 */
export async function getOrDetectDistroProfile(
	executor: DistroExecutor,
	sessionId: string,
): Promise<DistroProfile> {
	const cached = profileCache.get(sessionId);
	if (cached) return cached;
	const profile = await detectRemoteDistro(executor, sessionId);
	profileCache.set(sessionId, profile);
	return profile;
}

/** 远程探测发行版 Profile（一次 exec 往返） */
export async function detectRemoteDistro(
	executor: DistroExecutor,
	sessionId: string,
): Promise<DistroProfile> {
	const text = await executor.exec(sessionId, DISTRO_PROBE_CMD);
	return parseDistroProbe(text);
}
