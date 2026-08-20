/**
 * 迁移 CLI：pnpm db:migrate 独立执行迁移（bootstrap 也复用 runMigrations）
 */

import { runMigrations } from "./migrate";

await runMigrations();
