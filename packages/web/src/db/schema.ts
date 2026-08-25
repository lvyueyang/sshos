/**
 * SQLite drizzle schema（docs 技术架构 §4.3）。
 * 存储全部本地持久化数据：连接分组 / 连接 / 历史 / 快速命令 / 终端主题 / 结构化日志 / 设置 / 每连接配置
 */

import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** 连接分组 */
export const connectionGroup = sqliteTable("connection_group", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	/** 装饰色，如 #6054F1 */
	color: text("color"),
	sortOrder: integer("sort_order").default(0),
	createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

/** 终端主题（ANSI 配色方案，每个连接独立引用） */
export const terminalTheme = sqliteTable("terminal_theme", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	/** JSON: ANSI 16 色 + 前景 / 背景 / 光标 */
	config: text("config").notNull(),
	isBuiltin: integer("is_builtin").default(0),
});

/** SSH 连接 */
export const connection = sqliteTable(
	"connection",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		groupId: integer("group_id").references(() => connectionGroup.id),
		title: text("title").notNull(),
		host: text("host").notNull(),
		port: integer("port").default(22),
		username: text("username").notNull(),
		/** 认证方式：password / privateKey / systemKey / agent（决策记录 D4） */
		authType: text("auth_type", {
			enum: ["password", "privateKey", "systemKey", "agent"],
		}).notNull(),
		/** 密码，明文存储 */
		password: text("password"),
		/** 手动粘贴的私钥，明文存储 */
		privateKey: text("private_key"),
		/** 系统密钥路径，如 ~/.ssh/id_ed25519 */
		privateKeyPath: text("private_key_path"),
		/** 私钥 passphrase，明文存储 */
		passphrase: text("passphrase"),
		term: text("term").default("xterm-256color"),
		/** 标签装饰色 */
		color: text("color"),
		terminalThemeId: integer("terminal_theme_id").references(
			() => terminalTheme.id,
		),
		/** 生产环境标记，影响 Policy Engine 规则集 */
		isProduction: integer("is_production").default(0),
		/** AI 操作开关 */
		aiEnabled: integer("ai_enabled").default(1),
		sortOrder: integer("sort_order").default(0),
		lastConnectedAt: integer("last_connected_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
	},
	(t) => [index("connection_group_idx").on(t.groupId)],
);

/** 连接历史（每次连接插一行，含耗时；UI 按连接去重聚合展示） */
export const connectionHistory = sqliteTable(
	"connection_history",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		connectionId: integer("connection_id").references(() => connection.id),
		host: text("host").notNull(),
		port: integer("port").default(22),
		username: text("username").notNull(),
		connectedAt: integer("connected_at", { mode: "timestamp" }).notNull(),
		/** 连接时长（秒） */
		duration: integer("duration"),
	},
	(t) => [index("connection_history_conn_idx").on(t.connectionId)],
);

/** 快速命令（预存常用命令，终端侧栏点击即执行） */
export const quickCommand = sqliteTable("quick_command", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	command: text("command").notNull(),
	icon: text("icon"),
	sortOrder: integer("sort_order").default(0),
});

/** 结构化日志：AI 审计 / 终端命令 / Policy Engine 决策，枚举与策略引擎三级命名一致 */
export const log = sqliteTable(
	"log",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		type: text("type", {
			enum: ["ai_audit", "terminal_command", "policy_decision"],
		}).notNull(),
		sessionId: text("session_id"),
		connectionId: integer("connection_id").references(() => connection.id),
		command: text("command"),
		/** 分类：safe / review / block */
		classification: text("classification", {
			enum: ["safe", "review", "block"],
		}),
		/** 动作：executed / blocked / pending_approval / approved / rejected / user_input */
		action: text("action", {
			enum: [
				"executed",
				"blocked",
				"pending_approval",
				"approved",
				"rejected",
				"user_input",
			],
		}),
		/** 执行结果：success / failure / timeout */
		result: text("result", {
			enum: ["success", "failure", "timeout"],
		}),
		/** JSON 额外上下文 */
		detail: text("detail"),
		timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
	},
	(t) => [
		index("log_timestamp_idx").on(t.timestamp),
		index("log_connection_idx").on(t.connectionId),
		index("log_type_idx").on(t.type),
	],
);

/** App 设置（键值对，值 JSON 序列化） */
export const setting = sqliteTable("setting", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

/** 每连接配置（键值）：App 会话状态与桌面布局快照（key = app.<id>.state / desktop.layout） */
export const connectionSetting = sqliteTable(
	"connection_setting",
	{
		connectionId: integer("connection_id")
			.references(() => connection.id)
			.notNull(),
		key: text("key").notNull(),
		value: text("value").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(t) => [uniqueIndex("connection_setting_uk").on(t.connectionId, t.key)],
);
