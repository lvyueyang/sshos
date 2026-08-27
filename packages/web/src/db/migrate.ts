/**
 * 程序化数据库迁移：应用启动时执行 pending migrations，失败即启动失败（fail-fast）
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { logger } from "#/lib/logger/logger.server";
import { getDbPath } from "./index";

export { getDbPath } from "./index";

export async function runMigrations(): Promise<void> {
	const migrationsFolder = resolve(process.cwd(), "drizzle");
	if (!existsSync(migrationsFolder)) {
		logger.warn({ migrationsFolder }, "迁移目录不存在，跳过数据库迁移");
		return;
	}
	const sqlite = new DatabaseSync(getDbPath());
	sqlite.exec("PRAGMA journal_mode = WAL");
	const migrationDb = drizzle({ client: sqlite });
	migrate(migrationDb, {
		migrationsFolder,
		migrationsTable: "__drizzle_migrations",
	});
	logger.info("数据库迁移完成");
}
