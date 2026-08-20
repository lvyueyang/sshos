/**
 * App 实例管理器（docs 技术架构 §6.4）：每 Tab（连接）一个实例。
 * 负责生命周期分发、surface 挂载、布局快照读写（connection_setting）。
 * 实例销毁但状态保留：Tab 关闭 = 实例销毁，onSave 产物落库，下次进入自动还原。
 */

import { batchWriter } from "#/lib/batch-writer";
import { logger } from "#/lib/logger";
import {
	getConnectionSetting,
	setConnectionSetting,
} from "#/services/settings/settings.server";
import {
	dispatchCreate,
	dispatchRestore,
	dispatchSave,
	dispatchShutdown,
} from "./dispatcher";
import { type AppDefinition, getApp } from "./registry";
import type {
	AppContext,
	ContextMenuContext,
	Disposable,
	ShutdownReason,
} from "./types";

/** 运行中的 app 实例 */
interface AppInstance {
	def: AppDefinition;
	disposable: Disposable | undefined;
}

/** 右键菜单处理器注册表（按 app id 分组） */
type MenuHandler = (ctx: ContextMenuContext) => Promise<unknown> | unknown;

export class AppManager {
	private instances = new Map<string, AppInstance>();
	private menuHandlers = new Map<string, MenuHandler>();

	constructor(
		private connectionId: number,
		private sessionId: string,
	) {}

	/** 启动 app 实例：有保存状态先 onRestore，返回是否已启动 */
	async start(id: string): Promise<boolean> {
		const def = getApp(id);
		if (!def) throw new Error(`App 未注册: ${id}`);
		if (this.instances.has(id)) return false;

		const ctx = this.createContext(def);
		const disposable = dispatchCreate(def, ctx) ?? undefined;

		const state = await getConnectionSetting<unknown>(
			this.connectionId,
			`app.${id}.state`,
		);
		dispatchRestore(def, state);

		this.instances.set(id, { def, disposable });
		logger.debug({ appId: id, sessionId: this.sessionId }, "App 实例启动");
		return true;
	}

	/** 停止实例：onSave 收状态落库 → dispose；返回实例是否在运行 */
	async stop(id: string): Promise<boolean> {
		const inst = this.instances.get(id);
		if (!inst) return false;
		this.saveState(id, inst.def);
		inst.disposable?.dispose();
		this.instances.delete(id);
		logger.debug({ appId: id, sessionId: this.sessionId }, "App 实例停止");
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

	/** 构建当前 Tab 的右键菜单（聚合运行中 app 的贡献项处理器） */
	getMenuHandler(id: string): MenuHandler | undefined {
		return this.menuHandlers.get(id);
	}

	private async saveState(id: string, def: AppDefinition): Promise<void> {
		const state = dispatchSave(def);
		if (state !== undefined) {
			await setConnectionSetting(this.connectionId, `app.${id}.state`, state);
		}
	}

	/** 构建 App Context：按 manifest 能力裁剪暴露面 */
	private createContext(def: AppDefinition): AppContext {
		const { capabilities } = def.manifest;
		const session = {
			connectionId: this.connectionId,
			sessionId: this.sessionId,
		};

		return {
			session,
			// 按 capabilities 裁剪 SSH 网关（具体方法由各能力模块在 P4 注入）
			ssh: capabilities.reduce<Record<string, unknown>>((acc, cap) => {
				acc[cap] = true;
				return acc;
			}, {}),
			policy: {
				classify: { level: "safe" },
			},
			audit: {
				record: (entry: Record<string, unknown>) =>
					batchWriter.enqueue({
						type: "ai_audit",
						sessionId: session.sessionId,
						command: String(entry.command ?? ""),
						action: "executed",
						result: "success",
					}),
			},
			settings: {
				get: <T>(key: string) =>
					getConnectionSetting<T>(this.connectionId, key),
				set: <T>(key: string, value: T) =>
					setConnectionSetting(this.connectionId, key, value),
			},
			// UI 能力（openWindow / 面板 / 状态栏写入）由 UI 集成层在 P4 注入
			ui: {},
			menus: {
				registerHandler: (id: string, handler: MenuHandler): Disposable => {
					this.menuHandlers.set(id, handler);
					return { dispose: () => this.menuHandlers.delete(id) };
				},
			},
			lifecycle: {
				onSave: () => {
					// app 内保存由 onSave 钩子承载；此处为占位，供 app 主动注册补充保存
				},
				onShutdown: () => {},
			},
			log: {
				debug: (msg, ...args) =>
					logger.debug({ appId: def.manifest.id, ...args }, msg),
				info: (msg, ...args) =>
					logger.info({ appId: def.manifest.id, ...args }, msg),
				warn: (msg, ...args) =>
					logger.warn({ appId: def.manifest.id, ...args }, msg),
				error: (msg, ...args) =>
					logger.error({ appId: def.manifest.id, ...args }, msg),
			},
		};
	}
}
