CREATE TABLE `agentos_runtime_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`task_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`available_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runtime_jobs_due` ON `agentos_runtime_jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `runtime_jobs_owner` ON `agentos_runtime_jobs` (`owner_id`,`status`);
--> statement-breakpoint
INSERT OR IGNORE INTO agentos_runtime_jobs (id, owner_id, kind, task_id, status, available_at, created_at, updated_at)
SELECT json_array(w.owner_id, 'task', json_extract(t.value, '$.id')), w.owner_id, 'task', json_extract(t.value, '$.id'), 'pending', 0, 0, 0
FROM agentos_workspaces w, json_each(w.data, '$.tasks') t
WHERE COALESCE(json_extract(t.value, '$.executionMode'), 'automatic') != 'manual'
AND (json_extract(t.value, '$.status') IN ('queued', 'running') OR (json_extract(t.value, '$.status') = 'paused' AND json_extract(t.value, '$.paid') = 0));
--> statement-breakpoint
INSERT OR IGNORE INTO agentos_runtime_jobs (id, owner_id, kind, task_id, status, available_at, created_at, updated_at)
SELECT json_array(w.owner_id, 'order', json_extract(t.value, '$.id')), w.owner_id, 'order', json_extract(t.value, '$.id'), 'pending', 0, 0, 0
FROM agentos_workspaces w, json_each(w.data, '$.chainOrders') t
WHERE json_extract(t.value, '$.status') IN ('queued', 'running', 'awaiting-settlement');
