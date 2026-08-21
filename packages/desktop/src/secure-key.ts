/**
 * 凭据加密主密钥管理（决策记录 D18）：Electron main 用 safeStorage 保护随机 master key，
 * 经环境变量 SSHOS_MASTER_KEY 桥接给 Nitro 子进程，子进程 crypto 用其派生 AES-256 密钥。
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

/** master key 文件名（safeStorage 加密后存于 userData 目录，不随应用打包） */
const MASTER_KEY_FILE = "master.key";

/**
 * 获取或创建凭据加密主密钥。
 * safeStorage 可用时从 userData 读取（不存在则生成 256 位随机 key 并加密落盘）；
 * 不可用（如 Linux 无 keyring）返回 null，由调用方降级处理。
 * 已存在但解密/写入失败时抛错（不静默降级），由调用方 fail-fast——
 * 否则存量凭据无法解密且新凭据等价明文。
 */
export function getOrCreateMasterKey(): string | null {
	if (!safeStorage.isEncryptionAvailable()) {
		return null;
	}
	const dir = app.getPath("userData");
	mkdirSync(dir, { recursive: true });
	const file = path.join(dir, MASTER_KEY_FILE);
	if (existsSync(file)) {
		return safeStorage.decryptString(readFileSync(file));
	}
	const key = randomBytes(32).toString("hex");
	writeFileSync(file, safeStorage.encryptString(key), { mode: 0o600 });
	return key;
}
