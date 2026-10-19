import { env } from 'cloudflare:workers';
import * as store from './store';
import { claimJob, acknowledgeJob, queueSummary, workItems } from './queue';
import { runTask } from './runner';
import { runOrder } from './order-runner';
import { configuredOrderChain } from './order-runtime';

/** Durable checkpoints and expiring claims survive a killed request or consumer. */
export async function drainQueue(request: Request, ownerId?: string) {
  if (!env.DB) throw new Error('Runtime database unavailable.');
  const scope=ownerId??'__service__';
  const heartbeat=(status:string)=>env.DB!.prepare('INSERT INTO agentos_runtime_consumers(scope,last_seen,status) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status').bind(scope,Date.now(),status).run();
  await heartbeat('busy');
  try {
  const counts = {claimed:0,completed:0,rescheduled:0,failed:0}, started=Date.now();
  for(let i=0;i<4 && Date.now()-started<20000;i++) {
    const job = await claimJob(env.DB,ownerId);
    if(!job) break;
    counts.claimed++;
    let failed=false;
    try {
      if(job.kind==='task') {
        const snapshot=await store.read(job.owner_id);
        // Never promote a test/manual task, even if a stale or corrupted queue row exists.
        const task=snapshot.state.tasks.find(t=>t.id===job.task_id);
        if(task?.executionMode!=='manual') failed=(await runTask(store,job.owner_id,job.task_id,{delayMs:0})).status==='retryable';
      } else if(job.kind==='order') {
        const {chain,planner,supplier,supplierAuthority}=await configuredOrderChain(request);
        const result=await runOrder(store,job.owner_id,job.task_id,chain,{maxSteps:3,planner,supplier,supplierAuthority});
        failed=result.status==='retryable' && !!result.error;
      } else failed=true;
    } catch { failed=true; }
    // A read/ack failure leaves the lease for crash recovery; never claim completion.
    const snapshot=await store.read(job.owner_id);
    const acked=await acknowledgeJob(env.DB,job,snapshot,failed);
    if(failed) counts.failed++;
    if(acked) {
      const terminal=!workItems(snapshot.state).some(j=>j.kind===job.kind&&j.taskId===job.task_id);
      if(terminal) counts.completed++;else counts.rescheduled++;
    }
  }
  const result={...counts,queue:await queueSummary(env.DB,ownerId)};
  await heartbeat('ready');return result;
  }catch(error){await heartbeat('failed').catch(()=>{});throw error;}
}
