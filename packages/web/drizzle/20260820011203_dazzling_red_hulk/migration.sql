CREATE TABLE `connection` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`group_id` integer,
	`title` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22,
	`username` text NOT NULL,
	`auth_type` text NOT NULL,
	`password_enc` text,
	`private_key_enc` text,
	`private_key_path` text,
	`passphrase_enc` text,
	`term` text DEFAULT 'xterm-256color',
	`color` text,
	`terminal_theme_id` integer,
	`is_production` integer DEFAULT 0,
	`ai_enabled` integer DEFAULT 1,
	`sort_order` integer DEFAULT 0,
	`last_connected_at` integer,
	`created_at` integer,
	CONSTRAINT `fk_connection_group_id_connection_group_id_fk` FOREIGN KEY (`group_id`) REFERENCES `connection_group`(`id`),
	CONSTRAINT `fk_connection_terminal_theme_id_terminal_theme_id_fk` FOREIGN KEY (`terminal_theme_id`) REFERENCES `terminal_theme`(`id`)
);
--> statement-breakpoint
CREATE TABLE `connection_group` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `connection_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`connection_id` integer,
	`host` text NOT NULL,
	`port` integer DEFAULT 22,
	`username` text NOT NULL,
	`connected_at` integer NOT NULL,
	`duration` integer,
	CONSTRAINT `fk_connection_history_connection_id_connection_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`)
);
--> statement-breakpoint
CREATE TABLE `connection_setting` (
	`connection_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_connection_setting_connection_id_connection_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`)
);
--> statement-breakpoint
CREATE TABLE `log` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`type` text NOT NULL,
	`session_id` text,
	`connection_id` integer,
	`command` text,
	`classification` text,
	`action` text,
	`result` text,
	`detail` text,
	`timestamp` integer NOT NULL,
	CONSTRAINT `fk_log_connection_id_connection_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`)
);
--> statement-breakpoint
CREATE TABLE `quick_command` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`title` text NOT NULL,
	`command` text NOT NULL,
	`icon` text,
	`sort_order` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_theme` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`is_builtin` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `connection_group_idx` ON `connection` (`group_id`);--> statement-breakpoint
CREATE INDEX `connection_history_conn_idx` ON `connection_history` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connection_setting_uk` ON `connection_setting` (`connection_id`,`key`);--> statement-breakpoint
CREATE INDEX `log_timestamp_idx` ON `log` (`timestamp`);--> statement-breakpoint
CREATE INDEX `log_connection_idx` ON `log` (`connection_id`);--> statement-breakpoint
CREATE INDEX `log_type_idx` ON `log` (`type`);