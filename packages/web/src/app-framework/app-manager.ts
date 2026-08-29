/**
 * App 实例管理器（docs 技术架构 §6.4）：每 Tab（连接）一个实例。
 * 负责生命周期分发、surface 挂载、布局快照读写（connection_setting）。
 * 实例销毁但状态保留：Tab 关闭 = 实例销毁，onSave 产物落库，下次进入自动还原。
 * 纯客户端架构：settings / audit / log 由渲染层注入（走 SFn），不直连服务端模块。
 */

import { useDesktopStore } from "#/stores/windows";
import {
	dispatchCreate,
	dispatchRestore,
	dispatchSave,
	dispatchShutdown,
} from "./dispatcher";
import { getApp } from "./registry";
import type {
	AppContext,
	AppDefinition,
	AuditRecord,
	ContextMenuContext,
	Disposable,
	ShutdownReason,
} from "./types";

/** AppManager 外部依赖（渲染层注入，经 SFn 访问服务端） */
export interface AppManagerDeps {
	settings: {
		get(key: string): Promise<unknown>;
		set(key: string, value: unknown): Promise<void>;
	};
	audit: {
		record(entry: AuditRecord): Promise<void>;
	};
	log: AppContext["log"];
}

/** 运行中的 app 实例 */
interface AppInstance {
	def: AppDefinition;
	disposable: Disposable | undefined;
}

/** 右键菜单处理器注册表（按贡献点 id 分组） */
type MenuHandler = (ctx: ContextMenuContext) => Promise<unknown> | unknown;

export class AppManager {
	private instances = new Map<string, AppInstance>();
	private menuHandlers = new Map<string, MenuHandler>();

	constructor(
		private connectionId: number,
		private sessionId: string,
		private deps: AppManagerDeps,
	) {}

	/** 会话变更（重连）时同步 sessionId 与依赖，确保已启动实例的 audit/settings 闭包指向新会话 */
	updateSession(sessionId: string, deps: AppManagerDeps): void {
		this.sessionId = sessionId;
		this.deps = deps;
	}

	/** 启动 app 实例：有保存状态先 onRestore，返回是否已启动 */
	async start(id: string): Promise<boolean> {
		const def = getApp(id);
		if (!def) throw new Error(`App 未注册: ${id}`);
		if (this.instances.has(id)) return false;

		const ctx = this.createContext(def);
		const disposable = dispatchCreate(def, ctx);

		const state = await this.deps.settings.get(`app.${id}.state`);
		dispatchRestore(def, state);

		this.instances.set(id, { def, disposable });
		this.deps.log.debug(`App 实例启动: ${id}`);
		return true;
	}

	/** 停止实例：onSave 收状态落库 → dispose；返回实例是否在运行 */
	async stop(id: string): Promise<boolean> {
		const inst = this.instances.get(id);
		if (!inst) return false;
		await this.saveState(id, inst.def);
		inst.disposable?.dispose();
		this.instances.delete(id);
		this.deps.log.debug(`App 实例停止: ${id}`);
		return true;
	}

	/** 关闭全部实例（Tab 关闭 / 系统退出），可选关闭原因 */
	async shutdownAll(reason: ShutdownReason): Promise<void> {
		const ids = [...this.instances.keys()];
		for (const id of ids) {
			const inst = this.instances.get(id);
			if (!inst) continue;
			await this.stop(id);
			dispatchShutdown(inst.def, reason);
		}
	}

	/** 运行中的 app id 列表 */
	runningApps(): string[] {
		return [...this.instances.keys()];
	}

	/** 查询右键菜单处理器（未注册返回 undefined） */
	getMenuHandler(id: string): MenuHandler | undefined {
		return this.menuHandlers.get(id);
	}

	private async saveState(id: string, def: AppDefinition): Promise<void> {
		const state = dispatchSave(def);
		if (state !== undefined) {
			await this.deps.settings.set(`app.${id}.state`, state);
		}
	}

	/** 读本连接 tab.uiState[appId] 内指定字段（未写过返回 undefined） */
	private readUiState(appId: string, key: string): unknown {
		const appState = this.getAppUiState(appId);
		if (typeof appState !== "object" || appState === null) return undefined;
		return (appState as Record<string, unknown>)[key];
	}

	/** 写本连接 tab.uiState[appId] 内指定字段（key 级合并，随 store 持久化） */
	private writeUiState(appId: string, key: string, value: unknown): void {
		const appState = this.getAppUiState(appId);
		useDesktopStore.getState().setTabUiState(this.connectionId, appId, {
			...(typeof appState === "object" && appState !== null
				? (appState as Record<string, unknown>)
				: {}),
			[key]: value,
		});
	}

	/** 取本连接 tab.uiState[appId] 当前值 */
	private getAppUiState(appId: string): unknown {
		return useDesktopStore
			.getState()
			.tabs.find((t) => t.connectionId === this.connectionId)?.uiState[appId];
	}

	/** 构建 App Context：按 manifest 能力裁剪暴露面 */
	private createContext(def: AppDefinition): AppContext {
		const { capabilities } = def.manifest;
		const appId = def.manifest.id;
		const session = {
			connectionId: this.connectionId,
			sessionId: this.sessionId,
		};

		return {
			session,
			// 能力声明：框架据此暴露 SSH 网关方法（当前 MVP 窗口组件直连 SFn，网关注入后续迭代）
			ssh: capabilities.reduce<Record<string, unknown>>((acc, cap) => {
				acc[cap] = true;
				return acc;
			}, {}),
			policy: {
				classify: { level: "safe" },
			},
			audit: {
				record: (entry: AuditRecord) =>
					this.deps.audit.record({
						command: entry.command,
						classification: entry.classification,
						action: entry.action,
						result: entry.result,
					}),
			},
			settings: {
				get: <T>(key: string) =>
					this.deps.settings.get(key) as Promise<T | undefined>,
				set: (key: string, value: unknown) =>
					this.deps.settings.set(key, value),
			},
			// tab store 通道：app 展示/操作上下文态（随 tab 持久化，无需回写 DB）
			uiState: {
				get: <T>(key: string) => this.readUiState(appId, key) as T | undefined,
				set: (key: string, value: unknown) =>
					this.writeUiState(appId, key, value),
			},
			// UI 能力（openWindow / 面板写入 / 状态栏写入）后续迭代注入
			ui: {},
			menus: {
				registerHandler: (id: string, handler: MenuHandler): Disposable => {
					this.menuHandlers.set(id, handler);
					return { dispose: () => this.menuHandlers.delete(id) };
				},
			},
			lifecycle: {
				onSave: () => {},
				onShutdown: () => {},
			},
			log: this.deps.log,
		};
	}
}
