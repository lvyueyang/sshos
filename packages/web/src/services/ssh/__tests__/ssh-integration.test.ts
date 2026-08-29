/**
 * SSH 端到端集成测试：需真实服务器。设置 SSH_TEST_HOST / SSH_TEST_USER / SSH_TEST_PASSWORD
 * 环境变量后运行；未设置时整组跳过。
 */

import { afterAll, describe, expect, it } from "vitest";
import {
	type DistroExecutor,
	type DistroProfile,
	detectRemoteDistro,
} from "#/services/capabilities/distro/distro-profile";
import { SftpManager } from "#/services/ssh/sftp/sftp-manager";
import { type ConnectionOptions, SshManager } from "../connection/ssh-manager";
import { PtyManager } from "../pty/pty-manager";

const host = process.env.SSH_TEST_HOST;
const username = process.env.SSH_TEST_USER ?? "root";
const password = process.env.SSH_TEST_PASSWORD ?? "";
/** 目标发行版断言（默认 alpine，多发行版矩阵见 docs 04-决策记录 测试矩阵） */
const distro = process.env.SSH_TEST_DISTRO ?? "alpine";

/** 各发行版预期 Profile（测试矩阵容器：alpine/debian/rocky） */
const EXPECTED_PROFILE: Record<string, Partial<DistroProfile>> = {
	alpine: {
		id: "alpine",
		family: "alpine",
		packageManager: "apk",
		coreutils: "busybox",
	},
	debian: {
		id: "debian",
		family: "debian",
		packageManager: "apt",
		coreutils: "gnu",
	},
	rocky: {
		id: "rocky",
		family: "rhel",
		packageManager: "dnf",
		coreutils: "gnu",
	},
};

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

suites("SshManager 幂等接管与空闲回收", () => {
	it("connectionId 索引：命中存活会话，断开后失效", async () => {
		const s = await ssh.connect(buildOptions());
		expect(ssh.findByConnectionId(1)?.sessionId).toBe(s.sessionId);
		ssh.disconnect(s.sessionId);
		expect(ssh.findByConnectionId(1)).toBeUndefined();
	});

	it("touch 续租 & sweepExpired 空闲超 TTL 回收", async () => {
		const s = await ssh.connect(buildOptions());
		expect(ssh.touch(s.sessionId)).toBe(true);
		expect(ssh.touch("not-exist")).toBe(false);
		// 时间回拨到 lastHeartbeatAt 之后，以 idleMs=0 清扫必然超时
		ssh.sweepExpired(0, s.lastHeartbeatAt + 1);
		expect(ssh.has(s.sessionId)).toBe(false);
		expect(ssh.findByConnectionId(1)).toBeUndefined();
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

suites("DistroProfile 发行版探测", () => {
	/** 基于 ssh2 client exec 通道的探测执行器 */
	function executorFor(): DistroExecutor {
		return {
			exec: (sid, command) =>
				new Promise((resolve, reject) => {
					const session = ssh.get(sid);
					session.client.exec(command, (err, channel) => {
						if (err) return reject(err);
						let output = "";
						channel.on("data", (chunk: Buffer) => {
							output += chunk.toString();
						});
						channel.on("close", () => resolve(output));
						channel.on("error", reject);
					});
				}),
		};
	}

	it("探测测试机（Alpine）发行版 Profile", async () => {
		const session = await ssh.connect(buildOptions());
		const profile = await detectRemoteDistro(executorFor(), session.sessionId);
		const expected = EXPECTED_PROFILE[distro];
		expect(expected, `未知 SSH_TEST_DISTRO: ${distro}`).toBeDefined();
		expect(profile.id).toBe(expected.id);
		expect(profile.family).toBe(expected.family);
		expect(profile.packageManager).toBe(expected.packageManager);
		expect(profile.coreutils).toBe(expected.coreutils);
		ssh.disconnect(session.sessionId);
	});
});
