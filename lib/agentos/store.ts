import { env } from 'cloudflare:workers';
import { seed, transition, DomainError } from './engine';
import type { Command, Workspace } from './types';

export function owner(request: Request): string {
  const user = request.headers.get('oai-authenticated-user-id');
  if (user) return user;
  const host = new URL(request.url).hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'local-demo';
  throw new DomainError('Sign in to access your workspace.', 'UNAUTHORIZED');
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new DomainError('Cross-origin writes are not allowed.', 'FORBIDDEN');
}
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
