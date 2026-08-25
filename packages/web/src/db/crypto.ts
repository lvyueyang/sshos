/**
 * 敏感凭据加解密（docs 技术架构 §4.6）。
 * AES-256-GCM，主密钥来自数据目录 master.key（setup 时生成，决策记录 D21；
 * 与认证 JWT 职责分离，改启动密码不触发凭据重加密）。
 * setCredentialEncryptor 保留为宿主注入点（未来 Electron safeStorage 代理等）。
 * 生产环境 master.key 缺失或不可读时 fail-fast，不降级明文。
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { getOrCreateMasterKeyFile } from "#/services/auth/config";

let encryptFn: ((plain: string) => string) | null = null;
let decryptFn: ((enc: string) => string) | null = null;

/** 注入宿主加密实现（如 Electron safeStorage 代理），覆盖默认文件密钥方案 */
export function setCredentialEncryptor(
	encrypt: (plain: string) => string,
	decrypt: (enc: string) => string,
): void {
	encryptFn = encrypt;
	decryptFn = decrypt;
}

/** 恢复默认文件密钥方案（测试 / 宿主切换用） */
export function resetCredentialEncryptor(): void {
	encryptFn = null;
	decryptFn = null;
}

/** 派生 AES-256 主密钥：master.key 文件优先，生产缺失抛错、开发降级 dev-only */
function getMasterKey(): Buffer {
	try {
		return getOrCreateMasterKeyFile();
	} catch (error) {
		if (process.env.NODE_ENV === "production") {
			throw new Error("[crypto] 生产环境 master.key 不可用，拒绝降级明文", {
				cause: error,
			});
		}
		console.warn(
			"[crypto] master.key 不可用，凭据降级公开密钥（等价明文，仅开发）",
		);
		return createHash("sha256").update("dev-only-master-key").digest();
	}
}

/** 加密明文返回 base64（iv + authTag + ciphertext） */
export function encrypt(plain: string): string {
	if (encryptFn) return encryptFn(plain);
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(plain, "utf-8"),
		cipher.final(),
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

/** 解密 base64 密文，认证失败抛错 */
export function decrypt(enc: string): string {
	if (decryptFn) return decryptFn(enc);
	const buf = Buffer.from(enc, "base64");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const data = buf.subarray(28);
	const decipher = createDecipheriv("aes-256-gcm", getMasterKey(), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString(
		"utf-8",
	);
}
