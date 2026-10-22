import {DomainError} from './engine.ts';
import {canonicalPluginPaidRoot,readPluginFlow} from './plugin-paid-memory.ts';
import {pluginJob} from './plugin-store.ts';
import {createMixedWorkflow} from './mixed-workflow-store.ts';
import {runMixedWorkflow,type MixedRuntime} from './mixed-workflow-runner.ts';
import {findMixed,mixedStepUUID,verifyMixed} from './mixed-workflow.ts';
import {businessWizardDraft} from './mixed-wizard.ts';
import {monitorPermission} from './usdc-monitor-store.ts';
import {findMonitor,verifyMonitor,controlMonitor,type USDCMonitor} from './usdc-monitor-state.ts';
import {scanUSDCWindow} from './usdc-monitor-source.ts';
import type {MixedStore,MixedCreationContext} from './mixed-workflow-store.ts';
import type {Workspace} from './types.ts';
export type MonitorRuntime={context:()=>Promise<MixedCreationContext>;mixed:()=>Promise<MixedRuntime>;scan:(m:USDCMonitor)=>ReturnType<typeof scanUSDCWindow>};
export async function runUSDCMonitor(store:MixedStore,owner:string,id:string,getRuntime:()=>Promise<MonitorRuntime>){
 let scanning=false,scanStarted=0;
 const now=()=>new Date().toISOString(),token=crypto.randomUUID();
 const claimed=await store.updateWorkspace(owner,async state=>{const old=findMonitor(state,id);await verifyMonitor(old);if(!['running','paused','stopping'].includes(old.status)||old.lease&&old.lease.until>now()||old.expiresAt>now()&&old.nextPollAt&&old.nextPollAt>now())return state;const next=structuredClone(state);findMonitor(next,id).lease={token,until:new Date(Date.now()+240000).toISOString()};return next;});
 if(findMonitor(claimed.state,id).lease?.token!==token)return {status:findMonitor(claimed.state,id).status};
 const mutate=(reduce:(state:Workspace,m:USDCMonitor)=>void|Promise<void>)=>store.updateWorkspace(owner,async state=>{const old=findMonitor(state,id);if(old.lease?.token!==token||old.lease.until<=now())throw new DomainError('USDC monitor lease changed.','CONFLICT');const next=structuredClone(state),m=findMonitor(next,id);await reduce(next,m);m.updatedAt=now();return next;});
 try{
  let snapshot=await store.read(owner),m=findMonitor(snapshot.state,id);await verifyMonitor(m);const runtime=await getRuntime();
  if(m.status==='running'||m.status==='paused')try{await monitorPermission(store,owner,snapshot.state,m,await runtime.context());}catch(error){if(!(error instanceof DomainError))throw error;await mutate((state,current)=>{const stopped=controlMonitor(state,id,'stop');Object.assign(state,stopped);findMonitor(state,id).lease={token,until:new Date(Date.now()+240000).toISOString()};findMonitor(state,id).lastError=error.message;});snapshot=await store.read(owner);m=findMonitor(snapshot.state,id);}
  const active=m.reports.find(r=>r.status==='active');
  if(active){await runMixedWorkflow(store,owner,active.workflowId,runtime.mixed);snapshot=await store.read(owner);const flow=findMixed(snapshot.state,active.workflowId);await verifyMixed(flow);
   if(flow.status==='completed'){
    const child=await readPluginFlow(store,owner,flow.steps[1].childId!),step=child.steps[0],job=await pluginJob(store.database,owner,step.jobId),r=await runtime.mixed(),paid=await canonicalPluginPaidRoot(store,owner,{workflowId:child.id,step:0,taskId:step.taskId,settlementTransactionHash:step.settlement!.transactionHash,executionDigest:job.execution!.digest},(await r.plugins()).chain,m.draft.buyer);
    const output=paid.execution.output as Record<string,unknown>;if(output.sourceHash!==active.sourceHash||output.blockFrom!==active.from||output.blockTo!==active.to||output.account!==m.draft.account.toLowerCase()||output.thresholdBps!==m.draft.thresholdBps)throw new DomainError('Paid monitor report differs from its frozen source or policy.','FORBIDDEN');
    await mutate((_s,current)=>{const report=current.reports.find(x=>x.workflowId===flow.id)!;report.status='completed';report.output=paid.execution.output;current.cursor=report.to+1;current.anchor={number:report.to,hash:report.endHash};delete current.lastError;if(['running','paused'].includes(current.status)&&current.reports.length>=current.draft.maxReports)current.status='completed';current.nextPollAt=new Date(Date.now()+current.draft.pollSeconds*1000).toISOString();});
   }else if(['failed','cancelled'].includes(flow.status)){await mutate((_s,current)=>{const report=current.reports.find(x=>x.workflowId===flow.id)!;report.status='failed';report.error=flow.lastError??flow.status;if(current.status!=='stopping'){current.status='failed';current.lastError='A monitor report did not complete. Cursor retained; no automatic repurchase.';}current.nextPollAt=now();});}
   else await mutate((_s,current)=>{current.nextPollAt=new Date(Date.now()+1000).toISOString();});
  }else if(m.status==='stopping'){await mutate((_s,current)=>{current.status=current.expiresAt<=now()?'expired':current.lastError&&current.lastError!=='Stopped by owner.'?'failed':'stopped';delete current.pending;});}
  else if(m.status==='running'){
   if(m.reports.length>=m.draft.maxReports)await mutate((_s,current)=>{current.status='completed';});
   else if(m.pending){await createMixedWorkflow(store,owner,m.pending.draft,runtime.context,undefined,undefined,{id,token});await mutate((_s,current)=>{current.nextPollAt=now();delete current.lastError;});}
   else{scanning=true;scanStarted=Date.now();const scan=await runtime.scan(m);scanning=false;await mutate((_s,current)=>{current.lastScanAt=now();current.lastSuccessfulScanAt=now();current.lastScanDurationMs=Date.now()-scanStarted;current.finalizedHead=scan.finalized;current.sourceFailures=0;delete current.sourceError;});if(scan.kind==='data'){
     const draft=await businessWizardDraft({requestId:await mixedStepUUID(m.draft.requestId,m.reports.length),buyer:m.draft.buyer,title:m.draft.title.slice(0,90)+' · '+scan.from+'–'+scan.to,input:scan.input,mode:'usdc-policy',catalog:m.services,thresholdBps:m.draft.thresholdBps});draft.vaultSessionId=m.draft.vaultSessionId;draft.timeoutSeconds=Math.max(120,Math.min(600,Math.floor((Date.parse(m.expiresAt)-Date.now())/1000)));
     await mutate((_s,current)=>{current.pending={draft,from:scan.from,to:scan.to,endHash:scan.endHash,sourceHash:scan.sourceHash};current.nextPollAt=now();delete current.lastError;});
    }else await mutate((_s,current)=>{if(scan.kind==='empty'){current.cursor=scan.to+1;current.anchor={number:scan.to,hash:scan.endHash};current.emptyWindows++;}current.nextPollAt=new Date(Date.now()+current.draft.pollSeconds*1000).toISOString();delete current.lastError;});
   }
  }
  return {status:findMonitor((await store.read(owner)).state,id).status};
 }catch(error){
  if(error instanceof DomainError&&['FORBIDDEN','CONFLICT'].includes(error.code)){
   await mutate((state,current)=>{const completed=current.reports.find(report=>report.status==='active'&&state.mixedWorkflows?.some(flow=>flow.id===report.workflowId&&flow.status==='completed'));if(completed){completed.status='failed';completed.error=error.message;current.status='failed';current.lastError=error.message;delete current.pending;return;}const stopped=controlMonitor(state,id,'stop');Object.assign(state,stopped);findMonitor(state,id).lease={token,until:new Date(Date.now()+240000).toISOString()};findMonitor(state,id).lastError=error.message;}).catch(()=>{});
  }else await mutate((_s,m)=>{m.lastError='Source or runtime temporarily unavailable; checkpoint retained for retry.';if(scanning){m.lastScanAt=now();m.lastScanDurationMs=Date.now()-scanStarted;m.sourceFailures=(m.sourceFailures??0)+1;m.sourceError=error instanceof Error&&/^Data RPC /.test(error.message)?error.message:'Source scan unavailable.';}m.nextPollAt=new Date(Date.now()+m.draft.pollSeconds*1000).toISOString();}).catch(()=>{});
  return {status:'retryable',error:error instanceof DomainError?error.message:'Monitor checkpoint retained for retry.'};
 }finally{await store.updateWorkspace(owner,state=>{if(findMonitor(state,id).lease?.token!==token)return state;const next=structuredClone(state);delete findMonitor(next,id).lease;return next;}).catch(()=>{});}
}
