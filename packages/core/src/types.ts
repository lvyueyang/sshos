/**
 * @sshos/core 共享类型定义：SSH 连接、PTY 会话、SFTP 文件与系统指标快照
 */

import type { Duplex } from "node:stream";
import type { Client, ClientChannel } from "ssh2";

/** 认证方式枚举（决策记录 D4） */
export type AuthType = "password" | "privateKey" | "systemKey" | "agent";

/** 建立 SSH 连接所需的完整配置（凭据已由上层解密，core 不接触加密存储） */
export interface ConnectionOptions {
	/** 数据库中的连接记录 ID，用于审计与状态关联 */
	connectionId: number;
	host: string;
	port: number;
	username: string;
	authType: AuthType;
	/** 密码认证的明文密码 */
	password?: string;
	/** 私钥内容（privateKey 为粘贴、systemKey 为上层实时读取的文件内容） */
	privateKey?: string;
	/** 私钥 passphrase */
	passphrase?: string;
	/** SSH Agent 转发使用的 socket 路径（缺省时自动探测常见路径） */
	agent?: string;
	/** PTY 终端类型，如 xterm-256color */
	term?: string;
	/** 生产环境标记，影响 Policy Engine 规则集 */
	isProduction?: boolean;
	/** AI 操作开关 */
	aiEnabled?: boolean;
}

/** 一条 SSH 连接，一个桌面 Tab 对应一条 */
export interface SshSession {
	sessionId: string;
	connectionId: number;
	client: Client;
	host: string;
	port: number;
	username: string;
	createdAt: number;
	isProduction: boolean;
	aiEnabled: boolean;
}

/** PTY 会话：输出经 Node 流暴露，供 Server Route 转 Web ReadableStream 推送 */
export interface PtySession {
	ptyId: string;
	/** 所属 SSH 会话 */
	sessionId: string;
	channel: ClientChannel;
	/** PTY 输出流（UTF-8 字节流） */
	output: Duplex;
}

/** SFTP 文件 / 目录信息 */
export interface FileInfo {
	name: string;
	path: string;
	type: "file" | "directory" | "link" | "other";
	size: number;
	/** 权限串，如 drwxr-xr-x */
	mode: string;
	uid?: number;
	gid?: number;
	/** Unix 毫秒时间戳 */
	mtime?: number;
}

/** 系统指标快照（MetricsCollector 每个采样周期推送一条） */
export interface MetricsSnapshot {
	timestamp: number;
	cpu: { usage: number; cores: number };
	memory: { total: number; used: number; free: number };
	disk: { total: number; used: number; free: number };
	network: { rxBytesPerSec: number; txBytesPerSec: number };
}
