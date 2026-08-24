/**
 * 工具安装知识库单元测试：各包管理器命令生成与包名覆盖
 */

import { describe, expect, it } from "vitest";
import { buildInstallCommand, INSTALL_KNOWLEDGE } from "../install-knowledge";

describe("buildInstallCommand", () => {
	it("各包管理器生成对应安装命令", () => {
		expect(buildInstallCommand("apt", "rsync")).toBe("apt install -y rsync");
		expect(buildInstallCommand("dnf", "rsync")).toBe("dnf install -y rsync");
		expect(buildInstallCommand("yum", "rsync")).toBe("yum install -y rsync");
		expect(buildInstallCommand("apk", "rsync")).toBe("apk add rsync");
		expect(buildInstallCommand("pacman", "rsync")).toBe(
			"pacman -S --noconfirm rsync",
		);
		expect(buildInstallCommand("zypper", "rsync")).toBe(
			"zypper install -y rsync",
		);
		expect(buildInstallCommand("emerge", "rsync")).toBe("emerge rsync");
	});

	it("未知包管理器返回 null（调用方降级手动 / AI 安装）", () => {
		expect(buildInstallCommand("unknown", "rsync")).toBeNull();
		expect(buildInstallCommand("snap", "rsync")).toBeNull();
		expect(buildInstallCommand("flatpak", "rsync")).toBeNull();
	});
});

describe("INSTALL_KNOWLEDGE 覆盖", () => {
	it("常见工具覆盖主流包管理器（apt/dnf/yum/apk/pacman/zypper）", () => {
		const managers = ["apt", "dnf", "yum", "apk", "pacman", "zypper"] as const;
		for (const toolId of [
			"rsync",
			"zip",
			"unzip",
			"tar",
			"tmux",
			"htop",
			"lsof",
			"sysstat",
			"smartmontools",
			"net-tools",
			"podman",
		]) {
			const info = INSTALL_KNOWLEDGE[toolId];
			expect(info, `缺少知识库条目: ${toolId}`).toBeDefined();
			for (const pm of managers) {
				expect(info.packages[pm], `${toolId} 缺 ${pm} 包名`).toBeTruthy();
			}
		}
	});

	it("docker 等按发行版差异覆盖并提供手动安装兜底", () => {
		const docker = INSTALL_KNOWLEDGE.docker;
		expect(docker.packages.dnf).toBeUndefined(); // RHEL 系走官方脚本
		expect(docker.manual).toBeTruthy();
	});
});
