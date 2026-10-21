CREATE TABLE `agentos_memory_notes` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `agentos_memory_requests` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`action` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`result_json` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `memory_requests_owner` ON `agentos_memory_requests` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agentos_memory_vectors` (
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	`model_hash` text NOT NULL,
	`source_hash` text NOT NULL,
	`vector_json` text NOT NULL,
	`indexed_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `document_id`)
);
