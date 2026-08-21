/**
 * Electron 主进程：外壳角色，不承载业务逻辑。
 * 开发模式 spawn web 包 vite dev server；生产模式启动 web 的 Nitro 产物。
 * 两种模式都先轮询 /api/health 自检再加载窗口。
 */

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { bootstrap, onDeepLink, pendingDeepLink } from "./bootstrap";
import { getOrCreateMasterKey } from "./secure-key";
import { initUpdater } from "./updater";

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// 统一鉴权 token（决策记录 D19）：保护 web server 的 SFn 与 /api/* 端点，
// 防本地进程 / 浏览器恶意页面调用（威胁模型见 docs/04 D19）。
// 经 env 共享给子进程（server 校验）、经 additionalArguments 给 preload（渲染层取 header）
const authToken = randomBytes(16).toString("hex");
process.env.SSHOS_AUTH_TOKEN = authToken;

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
 * 打包后服务目录由 electron-builder extraResources 注入到 process.resourcesPath/server（见 electron-builder.yml），
 * 可用 SSHOS_SERVER_DIR 环境变量覆盖（本地调试）。
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
	// 决策记录 D18：safeStorage 保护 master key，经 SSHOS_MASTER_KEY 桥接给 Nitro 子进程；
	// NODE_ENV 显式置 production，保证 crypto 降级告警在生产环境生效
	const env: NodeJS.ProcessEnv = {
		...process.env,
		PORT: String(SERVER_PORT),
		NODE_ENV: "production",
	};
	const masterKey = getOrCreateMasterKey();
	if (masterKey) {
		env.SSHOS_MASTER_KEY = masterKey;
	} else {
		console.warn(
			"[main] safeStorage 不可用，凭据加密降级公开密钥（等价明文）；生产环境请配置系统密钥环",
		);
	}
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
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			// 鉴权 token 经 additionalArguments 传 preload（渲染层取 header，不直连 ipc）
			additionalArguments: [`--ssh-os-auth-token=${authToken}`],
		},
	});
	await mainWindow.loadURL(SERVER_URL);
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

/** 把 ssh:// 深链经 HTTP 推给 web server（渲染层经 GET 消费，不直连 ipcMain，docs 界面设计 §4.6） */
async function pushDeepLink(url: string): Promise<void> {
	try {
		await fetch(`${SERVER_URL}/api/deeplink`, {
			method: "POST",
			headers: {
				"Content-Type": "text/plain",
				// 全局鉴权（D19）：/api/* 路由需 X-SSHOS-TOKEN
				"X-SSHOS-TOKEN": authToken,
			},
			body: url,
		});
	} catch (err) {
		console.error("[main] 深链接送失败", err);
	}
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
		// 冷启动深链先推给 server 再建窗口：确保渲染层挂载 GET 确定性命中
		//（createWindow 后才 POST 会与挂载 GET 竞态，且新窗口 focus 事件先于监听注册，深链将悬置）
		if (pendingDeepLink) {
			await pushDeepLink(pendingDeepLink);
		}
		await createWindow();
	} catch (error) {
		// 启动失败即退出（fail-fast，对齐迁移语义）：master key 解密失败、服务启动超时等
		// 不应留下窗口挂着但功能不可用的状态
		console.error("[main] 启动失败", error);
		app.exit(1);
		return;
	}

	// 后台自动更新（仅打包环境，见 updater.ts）
	initUpdater();

	// 深链接线：运行时捕获的 ssh:// URL 推给 web server，渲染层消费（docs §4.6）
	onDeepLink((url) => void pushDeepLink(url));

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
