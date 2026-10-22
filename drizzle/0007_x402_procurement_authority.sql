CREATE TABLE `agentos_x402_evidence` (
	`owner_id` text NOT NULL,
	`order_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `order_id`)
);
--> statement-breakpoint
CREATE TABLE `agentos_x402_intents` (
	`owner_id` text NOT NULL,
	`order_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`touched_at` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `order_id`)
);
--> statement-breakpoint
CREATE TABLE `agentos_x402_tickets` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`order_id` text NOT NULL,
	`lease_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `x402_ticket_expiry` ON `agentos_x402_tickets` (`owner_id`,`expires_at`);