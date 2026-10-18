import { env } from 'cloudflare:workers';
import { seed, transition, DomainError } from './engine';
import type { Command, Workspace } from './types';
import { commitWithJobs } from './queue';
export { owner, checkOrigin } from './auth';
function db() { if (!env.DB) throw new Error('Database unavailable. Configure DB and apply the migration.'); return env.DB; }
export async function read(ownerId: string): Promise<{ state: Workspace; revision: number }> {
  const database = db();
  await database.prepare('INSERT OR IGNORE INTO agentos_workspaces (owner_id, revision, data) VALUES (?, 0, ?)').bind(ownerId, JSON.stringify(seed())).run();
  const row = await database.prepare('SELECT revision, data FROM agentos_workspaces WHERE owner_id = ?').bind(ownerId).first<{ revision: number; data: string }>();
  if (!row) throw new Error('Workspace could not be loaded.');
  return { state: JSON.parse(row.data), revision: row.revision };
}
export async function execute(ownerId: string, command: Command) {
  return updateWorkspace(ownerId, state => transition(state, command, new Date().toISOString()));
}
/** Trusted server reducers share the same atomic workspace commit as the runtime. */
export async function updateWorkspace(ownerId: string, reduce: (state: Workspace) => Promise<Workspace> | Workspace) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const { state, revision } = await read(ownerId);
    const next = await reduce(state);
    if (JSON.stringify(next) === JSON.stringify(state)) return {state, revision};
    if (await commitWithJobs(db(), ownerId, revision, state, next)) return { state: next, revision: revision + 1 };
  }
  throw new DomainError('Workspace is busy. Retry the same request identifier.', 'CONFLICT');
}
