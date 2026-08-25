/**
 * 终端命令追踪器单元测试：验证输入行累积、回车回调、退格/清行/删词、
 * ESC 控制序列跳过与密码提示抑制（密码行不落审计）。
 */

import { describe, expect, it } from "vitest";
import { createCommandTracker } from "../command-tracker";

/** 收集 emit 回调的命令，返回追踪器与命令列表 */
function setup() {
	const commands: string[] = [];
	const tracker = createCommandTracker((cmd) => commands.push(cmd));
	return { tracker, commands };
}

describe("createCommandTracker 输入行捕获", () => {
	it("回车时回调完整命令", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("ls -la\r");
		expect(commands).toEqual(["ls -la"]);
	});

	it("连续命令分别回调", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("pwd\rls\r");
		expect(commands).toEqual(["pwd", "ls"]);
	});

	it("空行 / 纯空格不回调", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("\r  \r");
		expect(commands).toEqual([]);
	});

	it("退格删除末尾字符", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("ls -la\x7f\x7f\r");
		expect(commands).toEqual(["ls -"]);
	});

	it("Ctrl-U 清行后重新输入", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("rm -rf\x15ls\r");
		expect(commands).toEqual(["ls"]);
	});

	it("Ctrl-W 删除前一个词", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("echo foo\x17\r");
		expect(commands).toEqual(["echo"]);
	});

	it("ESC 控制序列（箭头键）不混入命令行", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("ls\x1b[D\x1b[C\r");
		expect(commands).toEqual(["ls"]);
	});

	it("Alt+组合键不插入字符，保留现有行", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("abc\x1bdef\r");
		expect(commands).toEqual(["abcef"]);
	});

	it("单独 ESC 键（独立 chunk）清空当前输入", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("abc");
		tracker.handleInput("\x1b");
		tracker.handleInput("def\r");
		expect(commands).toEqual(["def"]);
	});

	it("跨 chunk 的 CSI 序列（\x1b[ 分片）正确跳过", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("ls\x1b[");
		tracker.handleInput("D\r");
		expect(commands).toEqual(["ls"]);
	});

	it("ESC 后跟控制字符（同 chunk）清行，控制字符走普通处理", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("abc\x1b\r");
		tracker.handleInput("ls\r");
		expect(commands).toEqual(["ls"]);
	});

	it("粘贴多行按行拆分回调", () => {
		const { tracker, commands } = setup();
		tracker.handleInput("echo a\nls\r");
		expect(commands).toEqual(["echo a", "ls"]);
	});
});

describe("createCommandTracker 密码提示抑制", () => {
	it("sudo 密码提示后的输入行不落审计", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput("[sudo] password for test:\r\n");
		tracker.handleInput("s3cret\r");
		expect(commands).toEqual([]);
	});

	it("抑制后恢复正常捕获（一次密码输入只抑制一行）", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput("Password: ");
		tracker.handleInput("s3cret\rls\r");
		expect(commands).toEqual(["ls"]);
	});

	it("无密码提示时正常记录（sudo 缓存凭据场景）", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput("deb http://... updated\r\n");
		tracker.handleInput("sudo apt update\r");
		expect(commands).toEqual(["sudo apt update"]);
	});

	it("输出含 password: 文本（非提示符）不误伤下一条命令", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput('{"password": "hunter2"}\r\n');
		tracker.handleInput("ls\r");
		expect(commands).toEqual(["ls"]);
	});

	it("中文密码提示同样抑制", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput("密码：");
		tracker.handleInput("p@ssw0rd\r");
		expect(commands).toEqual([]);
	});

	it("密码提示跨输出分片仍能识别（滚动尾部缓冲）", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput("[sudo] pass");
		tracker.consumeOutput("word for test:");
		tracker.handleInput("s3cret\r");
		expect(commands).toEqual([]);
	});

	it("Ctrl-C 中断密码等待后恢复正常记录", () => {
		const { tracker, commands } = setup();
		tracker.consumeOutput("Password: ");
		tracker.handleInput("\x03");
		tracker.handleInput("ls\r");
		expect(commands).toEqual(["ls"]);
	});
});
