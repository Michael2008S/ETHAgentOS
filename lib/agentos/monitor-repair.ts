import {digest,DomainError} from './engine.ts';
import {findMonitor,verifyMonitor} from './usdc-monitor-state.ts';
import {findMixed,verifyMixed} from './mixed-workflow.ts';
import {paidMixedStep,type MixedRuntime} from './mixed-workflow-runner.ts';
import type {MixedStore} from './mixed-workflow-store.ts';
import type {Workspace} from './types.ts';
const terminal=['failed','stopped','expired'];

/** Walk forward only through reciprocal, immutable repair links. */
export async function completedMonitorRepair(state:Workspace,id:string){
 const monitor=findMonitor(state,id);await verifyMonitor(monitor);
 if(!terminal.includes(monitor.status))throw new DomainError('Select a terminal monitor with an unreconciled report.','FORBIDDEN');
 const report=monitor.reports.find(r=>r.status==='failed');
 if(!report)throw new DomainError('No failed report to reconcile.');
 const source=findMixed(state,report.workflowId),lineage:ReturnType<typeof findMixed>[]=[];let repaired=source;
 for(let depth=0;;depth++){
  if(depth>=20||lineage.some(f=>f.id===repaired.id))throw new DomainError('Invalid or excessive monitor repair lineage.','CONFLICT');
  await verifyMixed(repaired);lineage.push(repaired);
  if(!repaired.repairedBy)break;
  const successor=findMixed(state,repaired.repairedBy);
  if(successor.repair?.sourceId!==repaired.id||successor.buyer.toLowerCase()!==source.buyer.toLowerCase())throw new DomainError('Monitor repair lineage changed.','CONFLICT');
  repaired=successor;
 }
 if(repaired===source||repaired.status!=='completed')throw new DomainError('Complete the latest mixed workflow repair first.','FORBIDDEN');
 const stamp=await digest(lineage.map(f=>({id:f.id,terms:f.termsHash,status:f.status,next:f.repairedBy??null})));
 return {monitor,report,source,repaired,stamp};
}

/** Adopt verified paid output without authorizing another purchase. */
export async function reconcileMonitorRepair(store:MixedStore,owner:string,id:string,runtime:MixedRuntime){
 const snapshot=await store.read(owner),resolved=await completedMonitorRepair(snapshot.state,id),{monitor,report,repaired}=resolved;
 const paid=await paidMixedStep(store,owner,snapshot.state,repaired,repaired.steps.length-1,runtime),output=paid.json as Record<string,unknown>;
 if(output.sourceHash!==report.sourceHash||output.blockFrom!==report.from||output.blockTo!==report.to||output.account!==monitor.draft.account.toLowerCase()||output.thresholdBps!==monitor.draft.thresholdBps)throw new DomainError('Repaired report differs from its frozen source or policy.','FORBIDDEN');
 return store.updateWorkspace(owner,async state=>{
  const current=await completedMonitorRepair(state,id);
  if(current.monitor.termsHash!==monitor.termsHash||current.stamp!==resolved.stamp||current.report.workflowId!==report.workflowId)throw new DomainError('Monitor repair changed. Refresh.','CONFLICT');
  const next=structuredClone(state),m=findMonitor(next,id),row=m.reports.find(r=>r.workflowId===report.workflowId)!;
  row.status='completed';row.repairWorkflowId=repaired.id;row.output=paid.json;delete row.error;
  m.cursor=row.to+1;m.anchor={number:row.to,hash:row.endHash};m.status=m.reports.length>=m.draft.maxReports?'completed':'stopped';
  delete m.lastError;delete m.pending;m.updatedAt=new Date().toISOString();return next;
 });
}
