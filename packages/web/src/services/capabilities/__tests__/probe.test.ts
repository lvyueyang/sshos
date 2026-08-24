/**
 * 远程工具探测纯函数单元测试：命令生成与输出解析（含工具名校验）
 */

import { describe, expect, it } from "vitest";
import { assertToolName, buildProbeCommand, parseProbeOutput } from "../probe";

describe("buildProbeCommand", () => {
	it("按固定模板生成 for 循环探测命令", () => {
		expect(buildProbeCommand(["rsync", "zip", "tar"])).toBe(
			'for t in rsync zip tar; do command -v "$t" >/dev/null 2>&1 && echo "$t=1" || echo "$t=0"; done',
		);
	});
});

describe("parseProbeOutput", () => {
	it("解析可用 / 不可用工具", () => {
		const text = "rsync=1\nzip=1\ntar=0\n";
		expect(parseProbeOutput(text, ["rsync", "zip", "tar"])).toEqual({
			rsync: true,
			zip: true,
			tar: false,
		});
	});

	it("缺失行视为不可用，容忍空行与空格", () => {
		expect(parseProbeOutput("  rsync=1  \n\n", ["rsync", "ctop"])).toEqual({
			rsync: true,
			ctop: false,
		});
	});
});

describe("assertToolName", () => {
	it("合法工具名放行", () => {
		expect(() => assertToolName("rsync")).not.toThrow();
		expect(() => assertToolName("docker-compose")).not.toThrow();
		expect(() => assertToolName("p7zip_full")).not.toThrow();
	});

	it("非法工具名拒绝（防命令注入）", () => {
		for (const bad of ["rm -rf /", "x;reboot", "$(id)", "a/b", "../evil", ""]) {
			expect(() => assertToolName(bad), bad).toThrow("非法工具名");
		}
	});
});
