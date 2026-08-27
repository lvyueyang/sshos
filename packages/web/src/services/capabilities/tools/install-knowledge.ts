/**
 * 工具安装知识库（docs 发行版适配计划 §3）：
 * 按工具给各包管理器包名，缺项 = 该包管理器无此包（走手动安装 / AI 安装）。
 * 纯数据模块，供安装引导（一键 / 手动）与 AI 上下文使用。
 */

import type { PackageManager } from "../distro/distro-profile";

/** 工具安装信息 */
export interface ToolInstallInfo {
	toolId: string;
	label: string;
	/** 各包管理器对应包名；缺项 = 该包管理器无此包 */
	packages: Partial<Record<PackageManager, string>>;
	/** 手动安装步骤（源码编译等，展示给用户） */
	manual?: string;
	/** 提示（如"可能需要 root 权限"、"版本差异"） */
	note?: string;
}

/** 生成各发行版的一键安装命令；返回 null 表示无法自动生成 */
export function buildInstallCommand(
	pm: PackageManager,
	pkg: string,
): string | null {
	switch (pm) {
		case "apt":
			return `apt install -y ${pkg}`;
		case "dnf":
			return `dnf install -y ${pkg}`;
		case "yum":
			return `yum install -y ${pkg}`;
		case "apk":
			return `apk add ${pkg}`;
		case "pacman":
			return `pacman -S --noconfirm ${pkg}`;
		case "zypper":
			return `zypper install -y ${pkg}`;
		case "emerge":
			return `emerge ${pkg}`;
		default:
			return null;
	}
}

/** 安装知识库（key = 工具 id，与 App manifest remoteRequirements.id 对齐） */
export const INSTALL_KNOWLEDGE: Record<string, ToolInstallInfo> = {
	rsync: {
		toolId: "rsync",
		label: "rsync",
		packages: {
			apt: "rsync",
			dnf: "rsync",
			yum: "rsync",
			apk: "rsync",
			pacman: "rsync",
			zypper: "rsync",
			emerge: "net-misc/rsync",
		},
	},
	zip: {
		toolId: "zip",
		label: "zip",
		packages: {
			apt: "zip",
			dnf: "zip",
			yum: "zip",
			apk: "zip",
			pacman: "zip",
			zypper: "zip",
			emerge: "app-arch/zip",
		},
	},
	unzip: {
		toolId: "unzip",
		label: "unzip",
		packages: {
			apt: "unzip",
			dnf: "unzip",
			yum: "unzip",
			apk: "unzip",
			pacman: "unzip",
			zypper: "unzip",
			emerge: "app-arch/unzip",
		},
	},
	tar: {
		toolId: "tar",
		label: "tar",
		packages: {
			apt: "tar",
			dnf: "tar",
			yum: "tar",
			apk: "tar",
			pacman: "tar",
			zypper: "tar",
			emerge: "app-arch/tar",
		},
	},
	lrzsz: {
		toolId: "lrzsz",
		label: "lrzsz（rz/sz）",
		packages: {
			apt: "lrzsz",
			dnf: "lrzsz",
			yum: "lrzsz",
			apk: "lrzsz",
			pacman: "lrzsz",
			zypper: "lrzsz",
			emerge: "net-misc/lrzsz",
		},
	},
	tmux: {
		toolId: "tmux",
		label: "tmux",
		packages: {
			apt: "tmux",
			dnf: "tmux",
			yum: "tmux",
			apk: "tmux",
			pacman: "tmux",
			zypper: "tmux",
			emerge: "app-misc/tmux",
		},
	},
	htop: {
		toolId: "htop",
		label: "htop",
		packages: {
			apt: "htop",
			dnf: "htop",
			yum: "htop",
			apk: "htop",
			pacman: "htop",
			zypper: "htop",
			emerge: "sys-process/htop",
		},
	},
	btop: {
		toolId: "btop",
		label: "btop",
		packages: {
			apt: "btop",
			dnf: "btop",
			yum: "btop",
			apk: "btop",
			pacman: "btop",
			zypper: "btop",
			emerge: "sys-process/btop",
		},
		manual:
			"btop 较新，源里没有时可用官方安装脚本：\ncurl -sS https://raw.githubusercontent.com/aristocratos/btop/main/install.sh | bash",
	},
	sysstat: {
		toolId: "sysstat",
		label: "sysstat（iostat/sar）",
		packages: {
			apt: "sysstat",
			dnf: "sysstat",
			yum: "sysstat",
			apk: "sysstat",
			pacman: "sysstat",
			zypper: "sysstat",
			emerge: "app-admin/sysstat",
		},
	},
	smartmontools: {
		toolId: "smartmontools",
		label: "smartmontools（smartctl）",
		packages: {
			apt: "smartmontools",
			dnf: "smartmontools",
			yum: "smartmontools",
			apk: "smartmontools",
			pacman: "smartmontools",
			zypper: "smartmontools",
			emerge: "sys-apps/smartmontools",
		},
		note: "smartctl 读取磁盘健康需 root 权限",
	},
	lsof: {
		toolId: "lsof",
		label: "lsof",
		packages: {
			apt: "lsof",
			dnf: "lsof",
			yum: "lsof",
			apk: "lsof",
			pacman: "lsof",
			zypper: "lsof",
			emerge: "sys-process/lsof",
		},
	},
	"net-tools": {
		toolId: "net-tools",
		label: "net-tools（netstat）",
		packages: {
			apt: "net-tools",
			dnf: "net-tools",
			yum: "net-tools",
			apk: "net-tools",
			pacman: "net-tools",
			zypper: "net-tools",
			emerge: "net-misc/net-tools",
		},
	},
	docker: {
		toolId: "docker",
		label: "Docker",
		packages: {
			apt: "docker.io",
			apk: "docker",
			pacman: "docker",
			zypper: "docker",
		},
		manual:
			"官方安装脚本（主流发行版通用）：\ncurl -fsSL https://get.docker.com | sh",
		note: "安装后需将用户加入 docker 组（sudo usermod -aG docker $USER）或使用 root",
	},
	podman: {
		toolId: "podman",
		label: "Podman",
		packages: {
			apt: "podman",
			dnf: "podman",
			yum: "podman",
			apk: "podman",
			pacman: "podman",
			zypper: "podman",
			emerge: "app-containers/podman",
		},
	},
	"docker-compose": {
		toolId: "docker-compose",
		label: "Docker Compose",
		packages: {
			apt: "docker-compose-v2",
			dnf: "docker-compose-plugin",
			apk: "docker-compose",
			pacman: "docker-compose",
			zypper: "docker-compose",
		},
		manual:
			"Compose v2 是 docker CLI 插件（docker compose），独立二进制可从 GitHub Releases 安装",
		note: "依赖 Docker 运行时",
	},
};
