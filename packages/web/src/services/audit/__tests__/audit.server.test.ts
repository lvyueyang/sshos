/**
 * 审计领域服务集成测试：
 * 临时数据目录 + 程序化迁移，验证 listLogs 过滤分页与 recordTerminalCommand 的会话校验
 * （真实会话落库路径由 terminal.e2e.test.ts 门控覆盖，此处验证防伪造丢弃与查询语义）。
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLogWriter } from "#/services/audit/audit-writer.server";
import { runMigrations } from "../../../db/migrate";
import { listLogs } from "../audit.server";
import { recordTerminalCommand } from "../terminal/terminal.server";

const dataDir = mkdtempSync(join(tmpdir(), "sshos-logs-"));
process.env.SSHOS_DATA_DIR = dataDir;

beforeAll(async () => {
	await runMigrations();
});

/** 直接 enqueue 一条 policy_decision 审计记录（模拟策略引擎写入） */
function enqueuePolicyDecision(
	sessionId: string,
	command: string,
	classification: "safe" | "review" | "block",
): void {
	auditLogWriter.enqueue({
		type: "policy_decision",
		sessionId,
		command,
		classification,
		action: classification === "block" ? "blocked" : "executed",
		result: classification === "block" ? "failure" : "success",
	});
}

describe("审计领域服务", () => {
	it("空库查询返回空数组", async () => {
		const rows = await listLogs({ limit: 50, offset: 0 });
		expect(rows).toEqual([]);
	});

	it("会话不存在时 recordTerminalCommand 丢弃（防伪造 sessionId 污染）", async () => {
		recordTerminalCommand("ghost-session", "fake command");
		await auditLogWriter.flush();

		const rows = await listLogs({
			sessionId: "ghost-session",
			limit: 50,
			offset: 0,
		});
		expect(rows).toEqual([]);
	});

	it("type 过滤排除不匹配类型（policy_decision 不被 terminal_command 查询返回）", async () => {
		enqueuePolicyDecision("sess-p", "rm -rf /", "block");
		await auditLogWriter.flush();

		// 确认 policy_decision 确实落库
		const all = await listLogs({ sessionId: "sess-p", limit: 50, offset: 0 });
		expect(all).toHaveLength(1);
		expect(all[0].type).toBe("policy_decision");

		// terminal_command 过滤下该记录被排除
		const filtered = await listLogs({
			sessionId: "sess-p",
			types: ["terminal_command"],
			limit: 50,
			offset: 0,
		});
		expect(filtered).toEqual([]);
	});

	it("分页 limit 生效", async () => {
		enqueuePolicyDecision("page-a", "a", "safe");
		enqueuePolicyDecision("page-b", "b", "safe");
		await auditLogWriter.flush();

		const rows = await listLogs({ limit: 1, offset: 0 });
		expect(rows).toHaveLength(1);
	});
});
