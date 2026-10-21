import { pendingTasks } from './runner.ts';
import { pendingOrders } from './orders.ts';
import type { Workspace } from './types.ts';
import { taskDeadline } from './lifecycle.ts';
import {pendingWorkflows} from './workflows.ts';

export type JobKind = 'task' | 'order' | 'workflow';
export type Job = { id: string; owner_id: string; kind: JobKind; task_id: string; status: string; lease_token: string; attempts: number; failures: number };
export function workItems(state: Workspace, now = Date.now()) {
  return [
    ...pendingTasks(state, undefined, new Date(now).toISOString()).map(t => ({kind: 'task' as const, taskId: t.id, deadline: taskDeadline(t), notBefore: 0})),
    ...state.tasks.filter(t => t.executionMode !== 'manual' && t.status === 'paused' && t.paid === 0 && Date.parse(taskDeadline(t)) > now).map(t => ({kind:'task' as const,taskId:t.id,deadline:taskDeadline(t),notBefore:Date.parse(taskDeadline(t))})),
    ...pendingOrders(state).map(o => ({kind: 'order' as const, taskId: o.id, deadline: o.deadlineAt, notBefore: o.evidencePendingAck&&o.evidenceAckAfter?Date.parse(o.evidenceAckAfter):o.status==='funding'&&o.vaultFunding?Math.min(Date.parse(o.vaultFunding.leaseUntil),Number(o.vaultFunding.deadline)*1000):0})),
    ...pendingWorkflows(state).map(w=>({kind:'workflow' as const,taskId:w.id,deadline:undefined,notBefore:0})),
  ];
}
export const jobId = (owner: string, kind: JobKind, taskId: string) => JSON.stringify([owner, kind, taskId]);

/** Workspace CAS and publication are one D1 transaction. Losing reducers publish nothing. */
export async function commitWithJobs(database: D1Database, owner: string, revision: number, before: Workspace, next: Workspace, now = Date.now()) {
  const data = JSON.stringify(next), prior = new Set(workItems(before, now).map(j => jobId(owner, j.kind, j.taskId)));
  const added = workItems(next, now).filter(j => !prior.has(jobId(owner, j.kind, j.taskId)));
  const statements = [database.prepare('UPDATE agentos_workspaces SET revision = revision + 1, data = ? WHERE owner_id = ? AND revision = ?').bind(data, owner, revision)];
  for (const job of added) statements.push(database.prepare(`INSERT INTO agentos_runtime_jobs (id, owner_id, kind, task_id, status, available_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, 'pending', ?, ?, ? WHERE EXISTS (SELECT 1 FROM agentos_workspaces WHERE owner_id = ? AND revision = ? AND data = ?)
    ON CONFLICT(id) DO UPDATE SET status = 'pending', available_at = excluded.available_at, failures = 0, last_error = NULL, updated_at = excluded.updated_at
    WHERE agentos_runtime_jobs.status IN ('completed', 'dead')`).bind(jobId(owner,job.kind,job.taskId),owner,job.kind,job.taskId,Math.max(now,job.notBefore),now,now,owner,revision+1,data));
  const results = await database.batch(statements);
  return results[0].meta.changes === 1;
}

/** Single statement claim: competing requests cannot acquire the same unexpired lease. */
export async function claimJob(database: D1Database, owner?: string, now = Date.now(), leaseMs = 120000): Promise<Job | null> {
  const due = "((status = 'pending' AND available_at <= ?) OR (status = 'leased' AND lease_until <= ?))";
  return database.prepare(`UPDATE agentos_runtime_jobs SET status = 'leased', lease_token = ?, lease_until = ?, attempts = attempts + 1, updated_at = ?
    WHERE id = (SELECT id FROM agentos_runtime_jobs WHERE ${due} ${owner === undefined ? '' : 'AND owner_id = ?'} ORDER BY available_at, created_at, id LIMIT 1) RETURNING *`)
    .bind(crypto.randomUUID(),now+leaseMs,now,now,now,...(owner === undefined ? [] : [owner])).first<Job>();
}

/** Fence both the lease token and workspace revision, including pause/resume races. */
export async function acknowledgeJob(database: D1Database, job: Job, snapshot: {state: Workspace; revision: number}, failed = false, now = Date.now()) {
  const item = workItems(snapshot.state, now).find(j => j.kind === job.kind && j.taskId === job.task_id);
  const failures = failed ? job.failures + 1 : 0;
  const status = !item ? 'completed' : failures >= 20 ? 'dead' : 'pending';
  const delay = failed ? Math.min(60000, 1000 * 2 ** Math.min(failures,6)) : 1000;
  const deadline = item?.deadline ? Date.parse(item.deadline) : Infinity;
  // A passed deadline still backs off failing RPCs; never hot-loop unavailable services.
  const available = Math.max(item?.notBefore ?? now,deadline > now ? Math.min(now+delay, deadline) : now+delay);
  const result = await database.prepare(`UPDATE agentos_runtime_jobs SET status = ?, available_at = ?, lease_token = NULL, lease_until = NULL, failures = ?, last_error = ?, updated_at = ?
    WHERE id = ? AND status = 'leased' AND lease_token = ? AND EXISTS (SELECT 1 FROM agentos_workspaces WHERE owner_id = ? AND revision = ?)`)
    .bind(status,available,failures,failed?'Execution unavailable; checkpoint retained.':null,now,job.id,job.lease_token,job.owner_id,snapshot.revision).run();
  return result.meta.changes === 1;
}

export async function queueSummary(database: D1Database, owner?: string) {
  const rows = await database.prepare(`SELECT status, COUNT(*) AS count FROM agentos_runtime_jobs ${owner === undefined ? '' : 'WHERE owner_id = ?'} GROUP BY status`).bind(...(owner === undefined ? [] : [owner])).all<{status:string;count:number}>();
  return Object.fromEntries(['pending','leased','completed','dead'].map(status => [status, rows.results.find(r => r.status === status)?.count ?? 0]));
}
