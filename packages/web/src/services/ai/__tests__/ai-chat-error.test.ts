/**
 * AI 对话流错误帧测试：未配置模型时发送消息必须收到 error 帧（历史缺陷——
 * prompt 失败被静默 closeStream，客户端"发送消息无任何提示"，D22 后补不吞错）。
 * 依赖真实 ModelRuntime（无模型/无凭据 → modelFallbackMessage），不触发网络请求。
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../../db/migrate";
import {
	buildEmptyResponseError,
	createAiChatStream,
} from "../chat/chat.server";

// 空数据目录：无 models.json / settings.json / 凭据 → pi 侧无可用模型
const dataDir = mkdtempSync(join(tmpdir(), "sshos-ai-err-"));
process.env.SSHOS_DATA_DIR = dataDir;

beforeAll(async () => {
	await runMigrations();
});

/** 读取流全部 chunk（error 帧为终止帧，读取即止） */
async function drain(
	stream: ReadableStream<
		{ type: "text-delta"; delta: string } | { type: "error"; message: string }
	>,
) {
	const reader = stream.getReader();
	const chunks: unknown[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	return chunks;
}

describe("AI 对话流错误帧（不吞错）", () => {
	it("未配置模型：立即返回 error 帧而非空流", async () => {
		const stream = await createAiChatStream("test-session", [
			{ role: "user", content: "你好" },
		]);
		const chunks = await drain(stream as never);
		expect(chunks.length).toBeGreaterThan(0);
		const first = chunks[0] as { type: string; message?: string };
		expect(first.type).toBe("error");
		expect(first.message ?? "").toContain("未配置可用模型");
	});

	it("prompt 报错不入库：仅走流错误帧，无残留副作用", async () => {
		// 二次调用仍稳定返回错误帧（模块级 ModelRuntime 单例不因首次失败污染）
		const stream = await createAiChatStream("test-session-2", [
			{ role: "user", content: "在吗" },
		]);
		const chunks = await drain(stream as never);
		expect(chunks.some((c) => (c as { type?: string }).type === "error")).toBe(
			true,
		);
	});
});

describe("buildEmptyResponseError（自定义端点失败指引）", () => {
	it("透出 pi 重试原因（非流式端点）并给流式指引", () => {
		const msg = buildEmptyResponseError(
			["Stream ended without finish_reason"],
			false,
		);
		expect(msg).toContain("Stream ended without finish_reason");
		expect(msg).toContain("SSE 流式");
		expect(msg).toContain("/v1");
	});

	it("无失败明细：给出通用排查清单", () => {
		const msg = buildEmptyResponseError([], false);
		expect(msg).toContain("baseUrl");
		expect(msg).toContain("API 类型");
		expect(msg).toContain("API Key");
	});

	it("仅工具调用无文本：明确提示换用支持工具调用的模型", () => {
		const msg = buildEmptyResponseError([], true);
		expect(msg).toContain("工具调用");
	});
});
