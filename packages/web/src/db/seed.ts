/**
 * 预置数据 seed（docs 技术架构 §9 bootstrap step 3）：默认分组与内置终端主题。
 * 幂等：仅当对应表为空时写入，启动时随迁移一并执行。
 */

import { eq } from "drizzle-orm";
import { db } from "./index";
import { terminalTheme } from "./schema";

/** 内置终端主题：Monokai（ANSI 16 色 + 前景 / 背景 / 光标，JSON 序列化） */
const MONOKAI_THEME = {
	ansi: [
		"#000000",
		"#f92672",
		"#a6e22e",
		"#f4bf75",
		"#66d9ef",
		"#ae81ff",
		"#a1efe4",
		"#f8f8f2",
		"#75715e",
		"#f92672",
		"#a6e22e",
		"#f4bf75",
		"#66d9ef",
		"#ae81ff",
		"#a1efe4",
		"#f9f8f5",
	],
	foreground: "#f8f8f2",
	background: "#272822",
	cursor: "#f8f8f2",
};

/** 幂等写入内置 Monokai 终端主题（同名主题不存在时） */
async function seedTerminalTheme(): Promise<void> {
	const existing = await db
		.select()
		.from(terminalTheme)
		.where(eq(terminalTheme.name, "Monokai"))
		.limit(1);
	if (existing.length > 0) return;
	await db.insert(terminalTheme).values({
		name: "Monokai",
		config: JSON.stringify(MONOKAI_THEME),
		isBuiltin: 1,
	});
}

/** 启动预置数据（迁移完成后调用） */
export async function runSeed(): Promise<void> {
	await seedTerminalTheme();
}
