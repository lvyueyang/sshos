/**
 * 敏感凭据加解密（docs 技术架构 §4.6）。
 * 默认走 Node crypto AES-256-GCM（密钥由 SSHOS_MASTER_KEY 派生），保证不以明文落盘；
 * 生产环境由 Electron main 通过环境变量 SSHOS_MASTER_KEY 注入 master key（决策记录 D18 密钥桥接，
 * safeStorage 保护该 key 后经 spawn env 传入，见 packages/desktop/src/secure-key.ts）。
 * setCredentialEncryptor 保留为未来 headless 服务模式（进程内启动 Nitro）的注入点。
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

let encryptFn: ((plain: string) => string) | null = null;
let decryptFn: ((enc: string) => string) | null = null;

/** 注入宿主加密实现（Electron safeStorage），覆盖默认 Node crypto 方案 */
export function setCredentialEncryptor(
	encrypt: (plain: string) => string,
	decrypt: (enc: string) => string,
): void {
	encryptFn = encrypt;
	decryptFn = decrypt;
}

/** 派生 AES-256 主密钥；生产必须由 Electron main 注入 SSHOS_MASTER_KEY（D18） */
function getMasterKey(): Buffer {
	const secret = process.env.SSHOS_MASTER_KEY;
	if (!secret) {
		// 生产环境未注入 master key 时，降级公开密钥等价明文（仅开发验证期接受，D18 接线后仅剩 Linux 无 keyring 场景）
		if (process.env.NODE_ENV === "production" && !encryptFn) {
			console.warn(
				"[crypto] 生产环境缺少 SSHOS_MASTER_KEY，凭据降级公开密钥（等价明文）",
			);
		}
		return createHash("sha256").update("dev-only-master-key").digest();
	}
	return createHash("sha256").update(secret).digest();
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
