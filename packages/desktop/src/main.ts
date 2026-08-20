/**
 * Electron 主进程：外壳角色，不承载业务逻辑。
 * 开发模式 spawn web 包 vite dev server；生产模式启动 web 的 Nitro 产物。
 * 两种模式都先轮询 /api/health 自检再加载窗口。
 */

import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { bootstrap } from "./bootstrap";

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let mainWindow: BrowserWindow | null = null;
let serverProc: ChildProcess | null = null;

/** web server 进程异常退出时直接结束应用，避免 health 轮询空等超时 */
function attachExitGuard(): void {
	serverProc?.on("exit", (code) => {
		if (code !== null && code !== 0) {
			app.exit(code);
		}
	});
}

/** 轮询 /api/health 直至 web server 就绪 */
async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${url}/api/health`);
			if (res.ok) return;
		} catch {
			// 服务未就绪，继续轮询
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`web server 启动超时: ${url}`);
}

/** 开发模式：启动 web 包 vite dev server */
function startDevServer(): Promise<void> {
	const webDir = path.resolve(__dirname, "../../web");
	const viteBin = path.resolve(webDir, "node_modules/.bin/vite");
	serverProc = spawn(viteBin, ["dev", "--port", String(SERVER_PORT)], {
		cwd: webDir,
		stdio: "inherit",
	});
	attachExitGuard();
	return waitForHealth(SERVER_URL);
}

/**
 * 生产模式：启动 web 的 Nitro 产物（.output/server/index.mjs）。
 * 打包后产物目录由 SSHOS_SERVER_DIR 指定，W4 由 electron-builder extraResources 注入。
 */
function startProductionServer(): Promise<void> {
	const serverDir =
		process.env.SSHOS_SERVER_DIR ?? path.resolve(__dirname, "../../web");
	const serverEntry = path.resolve(serverDir, ".output/server/index.mjs");
	serverProc = spawn(process.execPath, [serverEntry], {
		cwd: serverDir,
		env: { ...process.env, PORT: String(SERVER_PORT) },
		stdio: "inherit",
	});
	attachExitGuard();
	return waitForHealth(SERVER_URL);
}

async function createWindow(): Promise<void> {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		title: "SSH OS",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	await mainWindow.loadURL(SERVER_URL);
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(async () => {
	await bootstrap();
	const startServer = app.isPackaged ? startProductionServer : startDevServer;
	await startServer();
	await createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	serverProc?.kill();
});
