import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('agentos_workspaces', {
  ownerId: text('owner_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: text('data').notNull(),
});

export const runtimeJobs = sqliteTable('agentos_runtime_jobs', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  kind: text('kind').notNull(),
  taskId: text('task_id').notNull(),
  status: text('status').notNull().default('pending'),
  availableAt: integer('available_at').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: integer('lease_until'),
  attempts: integer('attempts').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('runtime_jobs_due').on(table.status, table.availableAt), index('runtime_jobs_owner').on(table.ownerId, table.status)]);

export const runtimeConsumers = sqliteTable('agentos_runtime_consumers', {
  scope: text('scope').primaryKey(),
  lastSeen: integer('last_seen').notNull(),
  status: text('status').notNull(),
  intervalMs: integer('interval_ms').notNull().default(2000),
});

export const consumerCredentials = sqliteTable('agentos_consumer_credentials', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  secretHash: text('secret_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  lastUsedAt: integer('last_used_at'),
  intervalMs: integer('interval_ms').notNull(),
}, table => [index('consumer_credentials_owner').on(table.ownerId, table.expiresAt)]);
