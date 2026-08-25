/**
 * 极简 JWT 实现（HS256，Node 内置 crypto，零第三方依赖）。
 * 结构 `base64url(header).base64url(payload).base64url(hmac)`，
 * 无状态：校验仅凭 serverSecret 验签 + exp 过期检查。
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** 登录 token 默认有效期：30 天（无刷新机制，过期后重新登录） */
export const TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/** JWT payload（业务字段保持最小） */
export interface JwtPayload {
	sub: string;
	iat: number;
	exp: number;
}

const b64url = (data: string | Buffer): string =>
	Buffer.from(data).toString("base64url");

/** 签发 HS256 JWT */
export function signJwt(
	sub: string,
	secret: string,
	ttlSec = TOKEN_TTL_SEC,
): string {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const payload = b64url(
		JSON.stringify({ sub, iat: now, exp: now + ttlSec } satisfies JwtPayload),
	);
	const signature = createHmac("sha256", secret)
		.update(`${header}.${payload}`)
		.digest("base64url");
	return `${header}.${payload}.${signature}`;
}

/** 校验 JWT（签名 + 过期）；非法返回 null */
export function verifyJwt(token: string, secret: string): JwtPayload | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, payload, signature] = parts;
	const expected = createHmac("sha256", secret)
		.update(`${header}.${payload}`)
		.digest("base64url");
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	try {
		const data = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf-8"),
		) as Partial<JwtPayload>;
		if (typeof data.exp !== "number" || Date.now() / 1000 > data.exp) {
			return null;
		}
		return data as JwtPayload;
	} catch {
		return null;
	}
}
