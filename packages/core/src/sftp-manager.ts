/**
 * SFTP 会话管理器：基于 ssh2 SFTP subsystem 的文件操作（list/stat/mkdir/delete/rename/流式读写）
 */

import { promisify } from "node:util";
import type { Client, SFTPWrapper, Stats } from "ssh2";
import type { FileInfo } from "./types";

export class SftpSessionError extends Error {
	constructor(sessionId: string) {
		super(`SFTP 会话未初始化: ${sessionId}`);
		this.name = "SftpSessionError";
	}
}

/** 数字 mode 转权限串，如 drwxr-xr-x */
function modeToString(mode: number, isDirectory: boolean): string {
	const type = isDirectory ? "d" : "-";
	const perm = (mode & 0o777)
		.toString(8)
		.padStart(3, "0")
		.split("")
		.map((d) => {
			const n = Number(d);
			return `${n & 4 ? "r" : "-"}${n & 2 ? "w" : "-"}${n & 1 ? "x" : "-"}`;
		})
		.join("");
	return `${type}${perm}`;
}

/** 合并远程路径（Linux 路径恒为 / 分隔） */
function joinPath(dir: string, name: string): string {
	return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

/** 由 ssh2 Attributes 生成业务 FileInfo */
function attrsToFileInfo(path: string, name: string, attrs: Stats): FileInfo {
	let type: FileInfo["type"] = "other";
	if (attrs.isDirectory()) type = "directory";
	else if (attrs.isSymbolicLink()) type = "link";
	else if (attrs.isFile()) type = "file";
	// ssh2 按 SFTP 协议返回的 mtime 为秒级 unix 时间戳，此处统一换算为毫秒
	const mtime =
		typeof attrs.mtime === "number" ? attrs.mtime * 1000 : undefined;
	return {
		name,
		path: joinPath(path, name),
		type,
		size: attrs.size,
		mode: modeToString(attrs.mode, attrs.isDirectory()),
		uid: attrs.uid,
		gid: attrs.gid,
		mtime,
	};
}

export class SftpManager {
	private sessions = new Map<string, SFTPWrapper>();

	/** 在连接上开启 SFTP subsystem 并登记 */
	async open(sessionId: string, client: Client): Promise<SFTPWrapper> {
		const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
			client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
		});
		this.sessions.set(sessionId, sftp);
		return sftp;
	}

	/** 列出远程目录内容 */
	async list(sessionId: string, path: string): Promise<FileInfo[]> {
		const sftp = this.get(sessionId);
		const entries = await promisify(sftp.readdir.bind(sftp))(path);
		return entries.map((entry) =>
			attrsToFileInfo(path, entry.filename, entry.attrs),
		);
	}

	/** 获取文件 / 目录元信息 */
	async stat(sessionId: string, path: string): Promise<FileInfo> {
		const sftp = this.get(sessionId);
		const attrs = await promisify(sftp.lstat.bind(sftp))(path);
		const name = path.split("/").filter(Boolean).at(-1) ?? path;
		return attrsToFileInfo(path, name, attrs);
	}

	/** 创建远程目录（parents 置 true 时递归创建） */
	async mkdir(sessionId: string, path: string): Promise<void> {
		const sftp = this.get(sessionId);
		await promisify(sftp.mkdir.bind(sftp))(path);
	}

	/** 递归删除远程文件 / 目录 */
	async delete(sessionId: string, path: string): Promise<void> {
		const sftp = this.get(sessionId);
		const lstat = promisify(sftp.lstat.bind(sftp));
		const readdir = promisify(sftp.readdir.bind(sftp));
		const rmdir = promisify(sftp.rmdir.bind(sftp));
		const unlink = promisify(sftp.unlink.bind(sftp));

		const attrs: Stats = await lstat(path);
		if (!attrs.isDirectory()) {
			await unlink(path);
			return;
		}
		const entries = await readdir(path);
		for (const entry of entries) {
			await this.delete(sessionId, joinPath(path, entry.filename));
		}
		await rmdir(path);
	}

	/** 重命名 / 移动（SFTP rename 原语） */
	async rename(
		sessionId: string,
		oldPath: string,
		newPath: string,
	): Promise<void> {
		const sftp = this.get(sessionId);
		await promisify(sftp.rename.bind(sftp))(oldPath, newPath);
	}

	/** 打开远程文件的读取流（供流式下载） */
	createReadStream(sessionId: string, path: string): NodeJS.ReadableStream {
		const sftp = this.get(sessionId);
		return sftp.createReadStream(path);
	}

	/** 打开远程文件的写入流（供流式上传） */
	createWriteStream(sessionId: string, path: string): NodeJS.WritableStream {
		const sftp = this.get(sessionId);
		return sftp.createWriteStream(path);
	}

	/** 关闭会话对应的 SFTP subsystem */
	close(sessionId: string): void {
		const sftp = this.sessions.get(sessionId);
		if (!sftp) return;
		this.sessions.delete(sessionId);
		sftp.end();
	}

	/** 查询 SFTP wrapper，未初始化抛 SftpSessionError */
	get(sessionId: string): SFTPWrapper {
		const sftp = this.sessions.get(sessionId);
		if (!sftp) throw new SftpSessionError(sessionId);
		return sftp;
	}
}
