/**
 * SFTP 领域服务（SSH 协议子系统，RFC 4253）：单例封装 SftpManager，供 SFn 与 Server Route 调用。
 * 提供 ensureSftp：会话首次使用 SFTP 时在已建立的 SSH 连接上懒开启 subsystem（一连接一 SFTP）。
 */

import { sshManager } from "../connection/ssh.server";
import { SftpManager } from "./sftp-manager";

export const sftpManager = new SftpManager();

/** 确保会话已开启 SFTP subsystem，返回 wrapper；未开启时懒打开并登记 */
export async function ensureSftp(sessionId: string) {
	try {
		return sftpManager.get(sessionId);
	} catch {
		// 首次使用：在已建立的 SSH 连接上开启 SFTP 通道
		const session = sshManager.get(sessionId);
		return sftpManager.open(sessionId, session.client);
	}
}
