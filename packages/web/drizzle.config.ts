/**
 * drizzle-kit 配置：迁移 SQL 输出到 drizzle/ 目录。
 * dbCredentials.url 为迁移 CLI 用默认路径，运行时实际路径由 SSHOS_DATA_DIR 决定（见 src/db/index.ts）
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dbCredentials: { url: "./data/data.db" },
});
