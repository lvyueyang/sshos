/**
 * 终端命令追踪 E2E 测试（SSH_TEST_HOST 门控，对齐 core ssh-integration）：
 * 真实连接开发测试机 → recordTerminalCommand 解析 connectionId → listLogs 查回。
 * 未设 SSH_TEST_HOST 时跳过；默认连本地 2222（sshos-test / test / testpass）。
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../../db/migrate";
import { batchWriter } from "../../../lib/batch-writer";
import { createConnection } from "../../../services/settings/settings.server";
import {
	connectSession,
	disconnectSession,
} from "../../../services/ssh/ssh.server";
import { listLogs, recordTerminalCommand } from "../logs.server";

const HOST = process.env.SSH_TEST_HOST ?? "localhost:2222";
const [host, portStr = "2222"] = HOST.split(":");
const port = Number(portStr);

const describeE2E = process.env.SSH_TEST_HOST ? describe : describe.skip;

const dataDir = mkdtempSync(join(tmpdir(), "sshos-logs-e2e-"));
process.env.SSHOS_DATA_DIR = dataDir;

describeE2E("logs 终端命令追踪 E2E", () => {
	beforeAll(async () => {
		await runMigrations();
	});

	it("真实连接后 recordTerminalCommand 解析 connectionId 并可查回", async () => {
		const connId = await createConnection({
			title: "e2e-alpine",
			host,
			port,
			username: "test",
			authType: "password",
			password: "testpass",
			isProduction: false,
		});

		const session = await connectSession(connId);
		try {
			recordTerminalCommand(session.sessionId, "echo ssh-os-e2e");
			await batchWriter.flush();

			const rows = await listLogs({
				sessionId: session.sessionId,
				types: ["terminal_command"],
				limit: 50,
				offset: 0,
			});
			const entry = rows.find((r) => r.command === "echo ssh-os-e2e");
			expect(entry).toBeDefined();
			expect(entry).toMatchObject({
				type: "terminal_command",
				action: "user_input",
				result: "success",
				connectionId: connId,
			});
		} finally {
			disconnectSession(session.sessionId);
		}
	});
});
