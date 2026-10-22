import {runPluginPurchase} from './plugin-purchase-runner';
import {configuredPluginPurchaseRuntime} from './plugin-purchase-runtime';
import {runPluginJob} from './plugin-runner';
import {pluginDatabase,configuredPluginExecutor} from './plugin-runtime';
import {configuredRepairRuntime} from './workflow-repair-runtime';
import {runWorkflowRepair} from './workflow-repair-runner';
import {workflowDrivesOrder} from './workflow-state';
import {workflowSupplierAccess} from './workflow-supplier-runtime';
import {digest} from './engine';
import { env } from 'cloudflare:workers';
import * as store from './store';
import { claimJob, acknowledgeJob, queueSummary, workItems } from './queue';
import { runTask } from './runner';
import { runOrder } from './order-runner';
import { configuredOrderChain } from './order-runtime';
import {workflowPublisher} from './workflow-runtime';
import {runPurchaseRoute} from './purchase-route-runner';
import {purchaseRouteAccess} from './purchase-route-runtime';
import {runWorkflow} from './workflow-runner';

/** Durable checkpoints and expiring claims survive a killed request or consumer. */
export async function drainQueue(request: Request, ownerId?: string, intervalMs=2000) {
  if (!env.DB) throw new Error('Runtime database unavailable.');
  const scope=ownerId??'__service__';
  const heartbeat=(status:string)=>env.DB!.prepare('INSERT INTO agentos_runtime_consumers(scope,last_seen,status,interval_ms) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET last_seen=excluded.last_seen,status=excluded.status,interval_ms=excluded.interval_ms').bind(scope,Date.now(),status,intervalMs).run();
  await heartbeat('busy');
  try {
  const counts = {claimed:0,completed:0,rescheduled:0,failed:0}, started=Date.now();
  for(let i=0;i<4 && Date.now()-started<20000;i++) {
    const job = await claimJob(env.DB,ownerId);
    if(!job) break;
    counts.claimed++;
    let failed=false;
    try {
      if(job.kind==='plugin-purchase'){const result=await runPluginPurchase(pluginDatabase(),job.owner_id,job.task_id,()=>configuredPluginPurchaseRuntime(request),{maxTransitions:8});failed=result.status==='retryable';}else if(job.kind==='plugin'){const result=await runPluginJob(pluginDatabase(),job.owner_id,job.task_id,()=>configuredPluginExecutor(request));failed=result.status==='retryable';}else if(job.kind==='task') {
        const snapshot=await store.read(job.owner_id);
        // Never promote a test/manual task, even if a stale or corrupted queue row exists.
        const task=snapshot.state.tasks.find(t=>t.id===job.task_id);
        if(task?.executionMode!=='manual') failed=(await runTask(store,job.owner_id,job.task_id,{delayMs:0})).status==='retryable';
      } else if(job.kind==='order') {
        const current=await store.read(job.owner_id),order=current.state.chainOrders?.find(o=>o.id===job.task_id);
        if(!order||!workflowDrivesOrder(current.state,order)){
        const {chain,planner,supplier,supplierAuthority,vaultFunder}=await configuredOrderChain(request);
        const result=await runOrder(store,job.owner_id,job.task_id,chain,{maxSteps:3,planner,supplier,supplierAuthority,vaultFunder});
        failed=result.status==='retryable' && !!result.error;
        }
      } else if(job.kind==='workflow'){
        const configured=await configuredOrderChain(request);
        const result=await runWorkflow(store,job.owner_id,job.task_id,configured.chain,workflowPublisher(configured),{...configured,maxSteps:3,workflowSuppliers:workflowSupplierAccess(configured,await digest({workspace:job.owner_id}))});
        failed=result.status==='retryable'&&!!result.error;
      } else if(job.kind==='repair'){
        const runtime=await configuredRepairRuntime(request,await digest({workspace:job.owner_id}));await runWorkflowRepair(store,job.owner_id,job.task_id,runtime);
      } else if(job.kind==='purchase'){
        const configured=await configuredOrderChain(request);const result=await runPurchaseRoute(store,job.owner_id,job.task_id,purchaseRouteAccess(configured),{...configured,maxSteps:3});failed=result.status==='retryable'&&!!result.error;
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
  await heartbeat(counts.failed?'failed':'ready');return result;
  }catch(error){await heartbeat('failed').catch(()=>{});throw error;}
}
