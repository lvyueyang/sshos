/**
 * App 插件框架核心类型（docs 技术架构 §6）：manifest 声明形态 / 能力 / 放置槽位，
 * 生命周期四钩子与上下文菜单贡献点
 */

/** 应用能力：框架据此裁剪 ctx.ssh 暴露面 */
export type Capability = "pty" | "sftp" | "exec" | "ai" | "metrics";

/** 桌面面板槽位 */
export type PanelSlot = "top-left" | "top-right";

/** 状态栏槽位 */
export type StatusBarSlot = "left" | "center" | "right";

/** 右键菜单作用对象 */
export type ContextMenuTarget = "file" | "folder";

/** 右键菜单贡献项（对齐 VS Code contributes.contextMenus） */
export interface ContextMenuContribution {
	/** 唯一标识，处理器据此绑定 */
	id: string;
	target: ContextMenuTarget;
	/** 显示文案（i18n key 或字面量） */
	label: string;
	icon?: string;
	/** 分组：open | manage | transfer | custom */
	group: string;
	/** 组内排序（默认 0） */
	order?: number;
	/** 简化条件表达式：folder-only / selection-count / 路径 glob */
	when?: string;
}

/** 三种放置形态 */
export type AppSurface =
	| { kind: "window"; defaultSize?: { w: number; h: number } }
	| { kind: "panel"; slot: PanelSlot; autoStart?: boolean }
	| { kind: "statusbar"; slot: StatusBarSlot; autoStart?: boolean };

/** App 插件声明 */
export interface AppManifest {
	id: string;
	title: string;
	icon?: string;
	capabilities: Capability[];
	/** window 是否单实例（默认 false，可多开） */
	singleton?: boolean;
	surfaces: AppSurface[];
	contributes?: {
		contextMenus?: ContextMenuContribution[];
	};
}

/** 右键菜单处理器上下文 */
export interface ContextMenuContext {
	target: ContextMenuTarget;
	session: { connectionId: number; sessionId: string };
	/** 当前目录 */
	path: string;
	/** 选中的文件 / 文件夹（1+） */
	items: { path: string; name: string; type: string }[];
	selectionCount: number;
}

/** 生命周期关闭原因 */
export type ShutdownReason = "systemExit" | "tabClose" | "userClose";

/** 生命周期钩子：实例销毁但状态保留（onSave 产物落 connection_setting） */
export interface AppLifecycle {
	onCreate?(ctx: AppContext): Disposable | undefined;
	onRestore?(state: unknown): void;
	onSave?(): unknown;
	onShutdown?(reason: ShutdownReason): void;
}

/** App 运行时上下文：只能访问 manifest 声明的能力 */
export interface AppContext {
	session: { connectionId: number; sessionId: string };
	/** 按 capabilities 裁剪的 SSH 网关 */
	ssh: Record<string, unknown>;
	/** 命令分类、审批请求 */
	policy: Record<string, unknown>;
	/** 审计记录 */
	audit: Record<string, unknown>;
	/** 每连接键值存储（connection_setting） */
	settings: Record<string, unknown>;
	/** 窗口 / 面板 / 状态栏写入与实例管理 */
	ui: Record<string, unknown>;
	/** 右键菜单贡献点：registerHandler(id, handler) */
	menus: {
		registerHandler(
			id: string,
			handler: (ctx: ContextMenuContext) => Promise<unknown> | unknown,
		): Disposable;
	};
	/** 生命周期钩子注册 */
	lifecycle: {
		onSave(fn: () => unknown): void;
		onShutdown(fn: (reason: ShutdownReason) => void): void;
	};
	log: {
		debug: (msg: string, ...args: unknown[]) => void;
		info: (msg: string, ...args: unknown[]) => void;
		warn: (msg: string, ...args: unknown[]) => void;
		error: (msg: string, ...args: unknown[]) => void;
	};
}

/** 生命周期注册结果（VS Code Disposable 订阅模式） */
export interface Disposable {
	dispose(): void;
}
