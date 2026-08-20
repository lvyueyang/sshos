/**
 * SSH 端到端集成测试：需真实服务器。设置 SSH_TEST_HOST / SSH_TEST_USER / SSH_TEST_PASSWORD
 * 环境变量后运行；未设置时整组跳过。
 */

import { afterAll, describe, expect, it } from "vitest";
import { PtyManager } from "../pty-manager";
import { SftpManager } from "../sftp-manager";
import { SshManager } from "../ssh-manager";
import type { ConnectionOptions } from "../types";

const host = process.env.SSH_TEST_HOST;
const username = process.env.SSH_TEST_USER ?? "root";
const password = process.env.SSH_TEST_PASSWORD ?? "";

const ssh = new SshManager();
const ptyManager = new PtyManager();
const sftpManager = new SftpManager();

const suites = describe.skipIf(!host);

afterAll(() => {
	for (const session of ssh.list()) {
		ssh.disconnect(session.sessionId);
	}
});

function buildOptions(): ConnectionOptions {
	return {
		connectionId: 1,
		host: host!,
		port: Number(process.env.SSH_TEST_PORT ?? 22),
		username,
		authType: "password",
		password,
	};
}

suites("SshManager 连接", () => {
	it("认证成功后返回会话，断开后移除", async () => {
		const session = await ssh.connect(buildOptions());
		expect(session.sessionId).toBeTruthy();
		expect(ssh.has(session.sessionId)).toBe(true);
		ssh.disconnect(session.sessionId);
		expect(ssh.has(session.sessionId)).toBe(false);
	});

	it("错误凭据抛认证失败", async () => {
		await expect(
			ssh.connect({ ...buildOptions(), password: "wrong-password" }),
		).rejects.toThrow();
	});
});

suites("PtyManager 终端", () => {
	it("创建 PTY、写入命令并收到回显", async () => {
		const session = await ssh.connect(buildOptions());
		const pty = await ptyManager.create(session.client, {
			sessionId: session.sessionId,
			cols: 80,
			rows: 24,
		});

		let output = "";
		const marker = "sshos-pty-ok";
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("PTY 输出超时")),
				15_000,
			);
			pty.output.on("data", (chunk: Buffer) => {
				output += chunk.toString();
				if (output.includes(marker)) {
					clearTimeout(timeout);
					resolve();
				}
			});
			pty.channel.write(`echo ${marker}\r`);
		});

		expect(output).toContain(marker);
		ptyManager.destroy(pty.ptyId);
		ssh.disconnect(session.sessionId);
	});

	it("resize 不抛错", async () => {
		const session = await ssh.connect(buildOptions());
		const pty = await ptyManager.create(session.client, {
			sessionId: session.sessionId,
		});
		expect(() => ptyManager.resize(pty.ptyId, 120, 40)).not.toThrow();
		ptyManager.destroy(pty.ptyId);
		ssh.disconnect(session.sessionId);
	});
});

suites("SftpManager 文件操作", () => {
	it("列出根目录", async () => {
		const session = await ssh.connect(buildOptions());
		await sftpManager.open(session.sessionId, session.client);
		const files = await sftpManager.list(session.sessionId, "/");
		expect(files.length).toBeGreaterThan(0);
		expect(files.some((f) => f.type === "directory")).toBe(true);
		sftpManager.close(session.sessionId);
		ssh.disconnect(session.sessionId);
	});

	it("mkdir → rename → delete 闭环", async () => {
		const session = await ssh.connect(buildOptions());
		await sftpManager.open(session.sessionId, session.client);
		const dir = "/tmp/sshos-test";
		const renamed = `${dir}-renamed`;
		await sftpManager.mkdir(session.sessionId, dir);
		await sftpManager.rename(session.sessionId, dir, renamed);
		const stat = await sftpManager.stat(session.sessionId, renamed);
		expect(stat.type).toBe("directory");
		await sftpManager.delete(session.sessionId, renamed);
		sftpManager.close(session.sessionId);
		ssh.disconnect(session.sessionId);
	});
});
