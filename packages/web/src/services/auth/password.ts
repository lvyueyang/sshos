/**
 * 启动密码哈希（scrypt，Node 内置零依赖）。
 * 存储格式 `saltHex:hashHex`；仅存哈希，明文密码永不下落盘。
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt 参数（Node 默认安全档，128MB 内存） */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

/** 计算密码哈希，返回 `salt:hash` 十六进制字符串 */
export function hashPassword(password: string): string {
	const salt = randomBytes(SALT_LEN);
	const hash = scryptSync(password, salt, KEY_LEN, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
	});
	return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** 校验密码与存储哈希是否匹配；存储格式非法时返回 false */
export function verifyPassword(password: string, stored: string): boolean {
	const [saltHex, hashHex] = stored.split(":");
	if (!saltHex || !hashHex) return false;
	const salt = Buffer.from(saltHex, "hex");
	const expected = Buffer.from(hashHex, "hex");
	const actual = scryptSync(password, salt, KEY_LEN, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
	});
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
