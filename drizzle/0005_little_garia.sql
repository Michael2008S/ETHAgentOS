CREATE TABLE `agentos_plugin_executions` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`workspace_hash` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `plugin_execution_scope` ON `agentos_plugin_executions` (`workspace_hash`,`id`);--> statement-breakpoint
CREATE INDEX `plugin_execution_owner` ON `agentos_plugin_executions` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agentos_plugin_grant_requests` (
	`owner_id` text NOT NULL,
	`request_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner_id`, `request_id`)
);
--> statement-breakpoint
CREATE TABLE `agentos_plugin_grants` (
	`owner_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner_id`, `plugin_id`)
);
--> statement-breakpoint
CREATE TABLE `agentos_plugins` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
