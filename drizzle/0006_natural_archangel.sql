CREATE TABLE `agentos_plugin_purchases` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`workspace_hash` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `plugin_purchase_owner` ON `agentos_plugin_purchases` (`owner_id`,`created_at`);