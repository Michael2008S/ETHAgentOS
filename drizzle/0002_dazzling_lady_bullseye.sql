CREATE TABLE `agentos_runtime_consumers` (
	`scope` text PRIMARY KEY NOT NULL,
	`last_seen` integer NOT NULL,
	`status` text NOT NULL
);
