/**
 * Electron 主进程：浏览器外壳（决策记录 D21）。
 * 职责仅限：spawn web server（dev vite / 生产 Nitro 产物）、health 自检、
 * 打开 BrowserWindow 加载 web 服务。认证 / 凭据加密 / 配置 / 数据全部由 web
 * 服务自洽（JWT + master.key + server.json），壳不注入 token 或主密钥、无 JSBridge。
 * 深链（ssh://）是壳自己的本地职责：冷启动经 URL 参数带给渲染层，运行时仅聚焦窗口。
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { bootstrap, onDeepLink, pendingDeepLink } from "./bootstrap";
import { initUpdater } from "./updater";

const DEFAULT_PORT = 3000;

/** 读取 web 服务监听端口（数据目录 server.json；目录约定对齐 web lib/paths.ts） */
function readServerPort(): number {
	const dir = path.join(homedir(), app.isPackaged ? ".ssh-os" : ".ssh-os-dev");
	const file = path.join(dir, "server.json");
	if (!existsSync(file)) return DEFAULT_PORT;
	try {
		const cfg = JSON.parse(readFileSync(file, "utf-8")) as { port?: unknown };
		return typeof cfg.port === "number" ? cfg.port : DEFAULT_PORT;
	} catch {
		return DEFAULT_PORT;
	}
}

const SERVER_PORT = readServerPort();
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

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

/** 开发模式：启动 web 包 vite dev server（端口对齐 server.json） */
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
 * 打包后服务目录由 electron-builder extraResources 注入到 process.resourcesPath/server（见 electron-builder.yml），
 * 可用 SSHOS_SERVER_DIR 环境变量覆盖（本地调试）。监听地址由 web server 读 server.json 决定。
 */
function startProductionServer(): Promise<void> {
	const serverDir =
		process.env.SSHOS_SERVER_DIR ??
		(app.isPackaged
			? path.join(process.resourcesPath, "server")
			: path.resolve(__dirname, "../../web"));
	// 服务根目录为 .output：迁移 SQL 随产物分发到 .output/drizzle（web build 脚本复制），
	// spawn cwd 指向 .output 才能被 runMigrations 的 resolve(cwd, "drizzle") 解析
	const serverRoot = path.resolve(serverDir, ".output");
	const serverEntry = path.resolve(serverRoot, "server/index.mjs");
	// 不注入 PORT / SSHOS_AUTH_TOKEN / SSHOS_MASTER_KEY：端口由 server.json 决定，
	// 认证与凭据加密由 web 服务自洽（D21）
	const env: NodeJS.ProcessEnv = {
		...process.env,
		NODE_ENV: "production",
	};
	serverProc = spawn(process.execPath, [serverEntry], {
		cwd: serverRoot,
		env,
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
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	// 冷启动深链经 URL 参数带给渲染层（壳的本地职责，不经过服务端 API）
	const url = pendingDeepLink
		? `${SERVER_URL}/?deeplink=${encodeURIComponent(pendingDeepLink)}`
		: SERVER_URL;
	await mainWindow.loadURL(url);
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// ssh:// 深链与多实例聚焦依赖单实例锁：未取得锁则本实例直接退出（由已运行实例接管）
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
	app.quit();
} else {
	app.whenReady().then(() => void start());
}

async function start(): Promise<void> {
	try {
		await bootstrap();
		const startServer = app.isPackaged ? startProductionServer : startDevServer;
		await startServer();
		await createWindow();
	} catch (error) {
		// 启动失败即退出（fail-fast，对齐迁移语义）
		console.error("[main] 启动失败", error);
		app.exit(1);
		return;
	}

	// 后台自动更新（仅打包环境，见 updater.ts）
	initUpdater();

	// 运行时深链：壳仅聚焦窗口（MVP 不预填，避免重载丢失桌面状态）
	onDeepLink(() => {});

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createWindow();
		}
	});
}

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
	serverProc?.kill();
});
