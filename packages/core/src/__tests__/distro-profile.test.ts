/**
 * 发行版 Profile 解析单元测试：覆盖 os-release 主路径与 redhat/debian/lsb/uname 回退链
 */

import { describe, expect, it } from "vitest";
import {
	buildDistroProfile,
	type DistroProbeResult,
	getOrDetectDistroProfile,
	parseDistroProbe,
	parseOsRelease,
} from "../distro-profile";

/** 按给定分段文本拼装探测命令输出（分段间用分隔符拼接） */
function probeText(segments: string[]): string {
	return segments
		.map((s) => s.replace(/\n$/, ""))
		.join("\n__SSHOS_DISTRO_SEP__\n");
}

/** 便捷构造探测结果 */
function makeProbe(partial: Partial<DistroProbeResult>): DistroProbeResult {
	return {
		osRelease: {},
		redhatRelease: "",
		debianVersion: "",
		lsbText: "",
		tools: {
			dnf: false,
			yum: false,
			systemctl: false,
			rcService: false,
			busybox: false,
		},
		uname: "Linux 6.6.0",
		...partial,
	};
}

const ALPINE_OS_RELEASE = [
	'NAME="Alpine Linux"',
	"ID=alpine",
	"VERSION_ID=3.20.3",
	'PRETTY_NAME="Alpine Linux v3.20"',
	"",
].join("\n");

describe("parseOsRelease", () => {
	it("解析 KEY=VALUE 与引号包裹", () => {
		const out = parseOsRelease(ALPINE_OS_RELEASE);
		expect(out.ID).toBe("alpine");
		expect(out.PRETTY_NAME).toBe("Alpine Linux v3.20");
		expect(out.NAME).toBe("Alpine Linux");
	});
});

describe("buildDistroProfile 各发行版", () => {
	it("Alpine：apk + OpenRC + busybox", () => {
		const profile = buildDistroProfile(
			makeProbe({
				osRelease: parseOsRelease(ALPINE_OS_RELEASE),
				tools: {
					dnf: false,
					yum: false,
					systemctl: false,
					rcService: true,
					busybox: true,
				},
			}),
		);
		expect(profile.id).toBe("alpine");
		expect(profile.family).toBe("alpine");
		expect(profile.packageManager).toBe("apk");
		expect(profile.initSystem).toBe("openrc");
		expect(profile.coreutils).toBe("busybox");
		expect(profile.prettyName).toBe("Alpine Linux v3.20");
	});

	it("Ubuntu：apt + systemd + GNU", () => {
		const profile = buildDistroProfile(
			makeProbe({
				osRelease: {
					ID: "ubuntu",
					PRETTY_NAME: "Ubuntu 22.04 LTS",
				},
				tools: {
					dnf: false,
					yum: false,
					systemctl: true,
					rcService: false,
					busybox: false,
				},
			}),
		);
		expect(profile.id).toBe("ubuntu");
		expect(profile.family).toBe("debian");
		expect(profile.packageManager).toBe("apt");
		expect(profile.initSystem).toBe("systemd");
		expect(profile.coreutils).toBe("gnu");
	});

	it("Rocky 9：os-release + dnf 可用 → dnf", () => {
		const profile = buildDistroProfile(
			makeProbe({
				osRelease: { ID: "rocky", PRETTY_NAME: "Rocky Linux 9.4" },
				tools: {
					dnf: true,
					yum: false,
					systemctl: true,
					rcService: false,
					busybox: false,
				},
			}),
		);
		expect(profile.family).toBe("rhel");
		expect(profile.packageManager).toBe("dnf");
		expect(profile.initSystem).toBe("systemd");
	});

	it("CentOS 7：无 dnf 仅 yum → yum", () => {
		const profile = buildDistroProfile(
			makeProbe({
				osRelease: { ID: "centos" },
				tools: {
					dnf: false,
					yum: true,
					systemctl: true,
					rcService: false,
					busybox: false,
				},
			}),
		);
		expect(profile.family).toBe("rhel");
		expect(profile.packageManager).toBe("yum");
	});
});

describe("buildDistroProfile 回退链", () => {
	it("无 os-release 时 redhat-release 兜底", () => {
		const profile = buildDistroProfile(
			makeProbe({
				redhatRelease: "CentOS release 6.10 (Final)",
				tools: {
					dnf: false,
					yum: true,
					systemctl: false,
					rcService: false,
					busybox: false,
				},
			}),
		);
		expect(profile.id).toBe("rhel");
		expect(profile.family).toBe("rhel");
		expect(profile.packageManager).toBe("yum");
		expect(profile.initSystem).toBe("sysvinit");
		expect(profile.prettyName).toBe("CentOS release 6.10 (Final)");
	});

	it("无 os-release 时 debian_version 兜底", () => {
		const profile = buildDistroProfile(
			makeProbe({
				debianVersion: "11.8",
				tools: {
					dnf: false,
					yum: false,
					systemctl: true,
					rcService: false,
					busybox: false,
				},
			}),
		);
		expect(profile.id).toBe("debian");
		expect(profile.family).toBe("debian");
		expect(profile.packageManager).toBe("apt");
	});

	it("全缺失时 lsb_release 兜底", () => {
		const profile = buildDistroProfile(
			makeProbe({
				lsbText: [
					"Distributor ID:\tArch",
					"Description:\tArch Linux",
					"Release:\trolling",
				].join("\n"),
			}),
		);
		expect(profile.id).toBe("arch");
		expect(profile.family).toBe("arch");
		expect(profile.packageManager).toBe("pacman");
	});

	it("全部缺失 → unknown", () => {
		const profile = buildDistroProfile(makeProbe({}));
		expect(profile.id).toBe("unknown");
		expect(profile.family).toBe("unknown");
		expect(profile.packageManager).toBe("unknown");
	});
});

describe("parseDistroProbe 整链", () => {
	it("解析探测命令输出（Alpine）", () => {
		const text = probeText([
			ALPINE_OS_RELEASE,
			"",
			"",
			"",
			"/sbin/dnf\n/usr/bin/systemctl\n/usr/bin/rc-service\n/bin/busybox",
			"Linux 6.6.80",
		]);
		const profile = parseDistroProbe(text);
		expect(profile.id).toBe("alpine");
		expect(profile.packageManager).toBe("apk");
		expect(profile.initSystem).toBe("systemd"); // systemctl 优先于 rc-service
		expect(profile.coreutils).toBe("busybox");
	});
});

describe("getOrDetectDistroProfile 缓存", () => {
	it("首次探测并缓存，二次命中不重复执行", async () => {
		let calls = 0;
		const executor = {
			exec: async () => {
				calls++;
				return probeText([ALPINE_OS_RELEASE, "", "", "", "", "Linux 6.6.80"]);
			},
		};
		const a = await getOrDetectDistroProfile(executor, "s1");
		const b = await getOrDetectDistroProfile(executor, "s1");
		expect(calls).toBe(1);
		expect(a).toEqual(b);
		expect(a.id).toBe("alpine");
	});
});
