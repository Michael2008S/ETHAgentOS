import {pendingMonitors,monitorDrivesMixed} from './usdc-monitor-state.ts';
import {pendingMixed,mixedDrivesPlugin} from './mixed-workflow.ts';
import {serviceRepairWorkItems} from './service-repair-policy.ts';
import {repairWorkItems} from './workflow-repair-policy.ts';
import { pendingTasks } from './runner.ts';
import { pendingOrders } from './orders.ts';
import type { Workspace } from './types.ts';
import { taskDeadline } from './lifecycle.ts';
import {pendingPurchaseRoutes} from './purchase-route-state.ts';
import {pendingWorkflows} from './workflows.ts';
import {workflowDrivesOrder} from './workflow-state.ts';

export type JobKind = 'task' | 'order' | 'workflow' | 'purchase' | 'repair' | 'plugin' | 'plugin-purchase' | 'service-repair' | 'mixed' | 'usdc-monitor' | 'ccip';
export type Job = { id: string; owner_id: string; kind: JobKind; task_id: string; status: string; lease_token: string; attempts: number; failures: number };
export function workItems(state: Workspace, now = Date.now()) {
  return [
    ...(state.ccipTasks??[]).filter(j=>!['completed','refunded','cancelled'].includes(j.status)).map(j=>({kind:'ccip' as const,taskId:j.id,deadline:undefined,notBefore:j.nextAttemptAt??0})),
    ...pendingMonitors(state).map(m=>({kind:'usdc-monitor' as const,taskId:m.id,deadline:undefined,notBefore:Math.max(m.lease?Date.parse(m.lease.until):0,m.status==='paused'&&!m.reports.some(r=>r.status==='active')?Date.parse(m.expiresAt):Math.min(Date.parse(m.expiresAt),m.nextPollAt?Date.parse(m.nextPollAt):0))})),
    ...pendingMixed(state).filter(f=>!monitorDrivesMixed(state,f.id)).map(f=>({kind:'mixed' as const,taskId:f.id,deadline:undefined,notBefore:f.lease?Date.parse(f.lease.until):0})),
    ...(state.pluginPurchases??[]).filter(f=>(f.status==='running'||f.status==='cancelling')&&!mixedDrivesPlugin(state,f.id)).map(f=>({kind:'plugin-purchase' as const,taskId:f.id,deadline:undefined,notBefore:f.leaseUntil?Date.parse(f.leaseUntil):0})),
    ...(state.pluginJobs??[]).filter(j=>j.status==='queued'||j.status==='running').map(j=>({kind:'plugin' as const,taskId:j.id,deadline:j.deadlineAt,notBefore:j.leaseUntil?Math.min(Date.parse(j.leaseUntil),Date.parse(j.deadlineAt)):0})),
    ...repairWorkItems(state,now),
    ...serviceRepairWorkItems(state,now),
    ...pendingTasks(state, undefined, new Date(now).toISOString()).map(t => ({kind: 'task' as const, taskId: t.id, deadline: taskDeadline(t), notBefore: 0})),
    ...state.tasks.filter(t => t.executionMode !== 'manual' && t.status === 'paused' && t.paid === 0 && Date.parse(taskDeadline(t)) > now).map(t => ({kind:'task' as const,taskId:t.id,deadline:taskDeadline(t),notBefore:Date.parse(taskDeadline(t))})),
    ...pendingOrders(state).filter(o=>!workflowDrivesOrder(state,o)).map(o => ({kind: 'order' as const, taskId: o.id, deadline: o.deadlineAt, notBefore: o.evidencePendingAck&&o.evidenceAckAfter?Date.parse(o.evidenceAckAfter):o.status==='funding'&&o.vaultFunding?Math.min(Date.parse(o.vaultFunding.leaseUntil),Number(o.vaultFunding.deadline)*1000):0})),
    ...pendingPurchaseRoutes(state).map(r=>({kind:'purchase' as const,taskId:r.id,deadline:undefined,notBefore:r.notBefore?Date.parse(r.notBefore):0})),
    ...pendingWorkflows(state).map(w=>({kind:'workflow' as const,taskId:w.id,deadline:undefined,notBefore:w.runLease?Date.parse(w.runLease.expiresAt):0})),
  ];
}
export const jobId = (owner: string, kind: JobKind, taskId: string) => JSON.stringify([owner, kind, taskId]);

/** Workspace CAS and publication are one D1 transaction. Losing reducers publish nothing. */
export async function commitWithJobs(database: D1Database, owner: string, revision: number, before: Workspace, next: Workspace, now = Date.now()) {
  const results = await database.batch(workspaceCommitStatements(database,owner,revision,before,next,now));
  return results[0].meta.changes === 1;
}
export function workspaceCommitStatements(database:D1Database,owner:string,revision:number,before:Workspace,next:Workspace,now=Date.now()){
  const data = JSON.stringify(next), prior = new Set(workItems(before, now).map(j => jobId(owner, j.kind, j.taskId)));
  const active = workItems(next, now), added = active.filter(j => !prior.has(jobId(owner, j.kind, j.taskId)));
  const statements = [database.prepare('UPDATE agentos_workspaces SET revision = revision + 1, data = ? WHERE owner_id = ? AND revision = ?').bind(data, owner, revision)];
  for (const job of added) statements.push(database.prepare(`INSERT INTO agentos_runtime_jobs (id, owner_id, kind, task_id, status, available_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, 'pending', ?, ?, ? WHERE EXISTS (SELECT 1 FROM agentos_workspaces WHERE owner_id = ? AND revision = ? AND data = ?)
    ON CONFLICT(id) DO UPDATE SET status = 'pending', available_at = excluded.available_at, failures = 0, last_error = NULL, updated_at = excluded.updated_at
    WHERE agentos_runtime_jobs.status IN ('completed', 'dead')`).bind(jobId(owner,job.kind,job.taskId),owner,job.kind,job.taskId,Math.max(now,job.notBefore),now,now,owner,revision+1,data));
  // Direct owner/workflow execution can finish an order before its pending queue
  // retry becomes due. Retire only rows absent from the committed work set; live
  // claims retain their lease and must acknowledge against the current revision.
  statements.push(database.prepare(`UPDATE agentos_runtime_jobs SET status = 'completed', updated_at = ?
    WHERE owner_id = ? AND status = 'pending' AND id NOT IN (SELECT value FROM json_each(?))
    AND EXISTS (SELECT 1 FROM agentos_workspaces WHERE owner_id = ? AND revision = ? AND data = ?)`)
    .bind(now,owner,JSON.stringify(active.map(j=>jobId(owner,j.kind,j.taskId))),owner,revision+1,data));
  return statements;
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

/** Retry only revision contention; a replaced lease remains fenced by acknowledgeJob. */
export async function acknowledgeLatest(database:D1Database,job:Job,read:()=>Promise<{state:Workspace;revision:number}>,failed=false){
 for(let attempt=0;attempt<4;attempt++){const snapshot=await read();if(await acknowledgeJob(database,job,snapshot,failed))return {acked:true,snapshot};}
 return {acked:false,snapshot:await read()};
}
