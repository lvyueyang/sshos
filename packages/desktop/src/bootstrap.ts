/**
 * 启动初始化：数据库迁移 / 预置数据 / 优雅关闭。
 * P0 为占位，P3/P5 完善迁移、seed 与审计缓冲强制刷新。
 */

import { app } from "electron";

export async function bootstrap(): Promise<void> {
	app.setName("SSH OS");
}
