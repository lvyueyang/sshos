/**
 * SQLite 数据库连接（node:sqlite + drizzle，零原生依赖）。
 * 懒加载实例；WAL 模式并发读不阻塞写。事务回调必须同步（docs 技术架构 §4.2）。
 */

import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { getDataDir } from "#/lib/paths/paths.server";

/** 数据库文件路径：数据目录约定见 getDataDir（开发 ~/.ssh-os-dev / 生产 ~/.ssh-os） */
export function getDbPath(): string {
	return path.join(getDataDir(), "ssh-os.db");
}

function createDb() {
	const sqlite = new DatabaseSync(getDbPath(), {
		enableForeignKeyConstraints: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = ON");
	// rc.4 的 node-sqlite drizzle 配置 omit schema；查询以显式传表方式调用
	return drizzle({ client: sqlite });
}

let dbInstance: ReturnType<typeof createDb> | null = null;

/** 懒加载 db 实例的 Proxy：首次访问才创建连接 */
export const db = new Proxy(
	{},
	{
		get(_, prop) {
			if (!dbInstance) dbInstance = createDb();
			return dbInstance[prop as keyof typeof dbInstance];
		},
	},
) as unknown as ReturnType<typeof createDb>;
