/**
 * 服务端配置（server.json）与凭据加密主密钥（master.key）读写。
 * server.json 位于数据目录：{ passwordHash, serverSecret, port, bind }，
 * 首次启动经 /api/auth/setup 写入；port/bind 手工编辑后重启生效。
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "#/lib/paths";

/** server.json 配置项 */
export interface ServerConfig {
	/** 启动密码 scrypt 哈希（setup 时写入；为空视为未配置） */
	passwordHash: string | null;
	/** JWT 签名密钥（setup 时随机生成） */
	serverSecret: string;
	/** 监听端口 */
	port: number;
	/** 监听地址，默认仅本机（0.0.0.0 需手动开启局域网访问） */
	bind: string;
}

/** 默认监听：仅本机、3000 端口 */
export const SERVER_DEFAULTS = { port: 3000, bind: "127.0.0.1" } as const;

/** server.json 完整路径 */
export function getServerConfigPath(): string {
	return join(getDataDir(), "server.json");
}

/** 读取 server.json；不存在或解析失败返回 null */
export function readServerConfig(): ServerConfig | null {
	const file = getServerConfigPath();
	if (!existsSync(file)) return null;
	try {
		const raw = JSON.parse(readFileSync(file, "utf-8")) as Record<
			string,
			unknown
		>;
		return {
			passwordHash:
				typeof raw.passwordHash === "string" ? raw.passwordHash : null,
			serverSecret:
				typeof raw.serverSecret === "string" ? raw.serverSecret : "",
			port: typeof raw.port === "number" ? raw.port : SERVER_DEFAULTS.port,
			bind: typeof raw.bind === "string" ? raw.bind : SERVER_DEFAULTS.bind,
		};
	} catch {
		return null;
	}
}

/** 写入 server.json（0600，含 passwordHash / serverSecret 敏感字段） */
export function writeServerConfig(config: ServerConfig): void {
	mkdirSync(getDataDir(), { recursive: true });
	writeFileSync(getServerConfigPath(), JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
}

/** 是否已完成首次配置（密码与签名密钥均已就绪） */
export function isConfigured(
	config: ServerConfig | null = readServerConfig(),
): boolean {
	return (
		config !== null &&
		Boolean(config.passwordHash) &&
		Boolean(config.serverSecret)
	);
}

/** master.key 完整路径（凭据加密主密钥，独立于认证，setup 时生成） */
export function getMasterKeyPath(): string {
	return join(getDataDir(), "master.key");
}

/**
 * 读取或创建凭据加密主密钥（32 字节随机 hex，0600）。
 * 文件缺失时创建；创建失败抛错（生产由 crypto 层 fail-fast，不降级明文）。
 */
export function getOrCreateMasterKeyFile(): Buffer {
	const file = getMasterKeyPath();
	if (existsSync(file)) {
		return Buffer.from(readFileSync(file, "utf-8").trim(), "hex");
	}
	const key = randomBytes(32);
	mkdirSync(getDataDir(), { recursive: true });
	writeFileSync(file, key.toString("hex"), { mode: 0o600 });
	return key;
}
