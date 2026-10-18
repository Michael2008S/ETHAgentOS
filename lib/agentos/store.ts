import { env } from 'cloudflare:workers';
import { seed, transition, DomainError } from './engine';
import type { Command, Workspace } from './types';
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
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 12; attempt++) {
    const { state, revision } = await read(ownerId);
    const next = await transition(state, command, now);
    // A single-row compare-and-swap atomically commits task, budget, ledger and receipt.
    const result = await db().prepare('UPDATE agentos_workspaces SET revision = revision + 1, data = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(next), ownerId, revision).run();
    if (result.meta.changes === 1) return { state: next, revision: revision + 1 };
  }
  throw new DomainError('Workspace is busy. Retry the same request identifier.', 'CONFLICT');
}
