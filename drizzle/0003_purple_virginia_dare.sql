CREATE TABLE `agentos_consumer_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`interval_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consumer_credentials_owner` ON `agentos_consumer_credentials` (`owner_id`,`expires_at`);--> statement-breakpoint
ALTER TABLE `agentos_runtime_consumers` ADD `interval_ms` integer DEFAULT 2000 NOT NULL;