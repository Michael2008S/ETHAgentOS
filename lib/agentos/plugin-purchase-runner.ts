import {digest,DomainError} from './engine.ts';
import {canonical,resultHash} from '../../cre/workflow/verify.ts';
import {pluginInstallation,pluginGrant,pluginJob,createPluginJob,cancelPluginJob,type PluginDatabase, type PluginSnapshot} from './plugin-store.ts';
import {pluginExecutionRequest} from './plugin-state.ts';
import {runPluginJob,type PluginExecutor} from './plugin-runner.ts';
import {validatePluginValue,verifyPluginExecution,type PluginExecution,type Json} from './plugin-protocol.ts';
import {pluginVaultAllowance,sessionBinding,type VaultSession} from './vault.ts';
import {pluginPurchase,changePluginPurchase,pluginPurchaseDailyExposure} from './plugin-purchase-store.ts';
import {selectPluginPurchaseInput,pluginPurchaseSpec,type PluginPurchaseWorkflow,type PluginPurchaseStep} from './plugin-purchase-protocol.ts';
import type {PluginPurchaseChain} from './plugin-purchase-chain.ts';
export type PluginPurchaseRuntime={chain:PluginPurchaseChain;executor:()=>Promise<PluginExecutor>;checkSession:(session:VaultSession,gross:number)=>Promise<unknown>};
const active=(f:PluginPurchaseWorkflow)=>f.status==='running'||f.status==='cancelling';
async function permit(store:PluginDatabase,owner:string,snapshot:PluginSnapshot,flow:PluginPurchaseWorkflow,step:PluginPurchaseStep,now:string){
 if(flow.status!=='running'||flow.deadlineAt<=now||!snapshot.state.policy.active||step.priceCents>snapshot.state.policy.maxTaskBudget||pluginPurchaseDailyExposure(snapshot.state,flow.deployment,now)>snapshot.state.policy.dailyBudget)throw new DomainError('Plugin workflow permission or deadline changed.','FORBIDDEN');
 const installed=await pluginInstallation(store.database,owner,step.pluginId),grant=await pluginGrant(store.database,owner,step.pluginId);
 if(!installed||installed.manifestHash!==step.manifestHash||!grant?.enabled||grant.epoch!==step.grantEpoch||grant.manifestHash!==step.manifestHash||grant.runtimeHash!==step.runtimeHash||grant.expiresAt<=now)throw new DomainError('The original plugin grant has expired or was revoked.','FORBIDDEN');
 const session=pluginVaultAllowance(snapshot.state,flow.vaultSessionId,flow.buyer,{pluginId:step.pluginId,manifestHash:step.manifestHash,runtimeHash:step.runtimeHash,maxPriceCents:step.priceCents},step.priceCents,0,now);
 if(session.scope!==flow.scope||canonical(sessionBinding(session))!==canonical(flow.vault))throw new DomainError('The reviewed plugin Vault session changed.','FORBIDDEN');return {installed,session};
}
async function acceptedExecution(store:PluginDatabase,owner:string,flow:PluginPurchaseWorkflow,step:PluginPurchaseStep){
 const job=await pluginJob(store.database,owner,step.jobId),installed=await pluginInstallation(store.database,owner,step.pluginId);
 if(job.status!=='completed'||!job.execution||!installed||job.inputHash!==step.inputHash||job.purchase?.workflowId!==flow.id||job.purchase.step!==step.index)throw new DomainError('A plugin purchase has no accepted scoped delivery.','FORBIDDEN');
 await verifyPluginExecution(job.execution,{...pluginExecutionRequest(job,installed),runtimeSigner:flow.runtime.deliverySigner});return job.execution;
}
export async function runPluginPurchase(store:PluginDatabase,owner:string,id:string,getRuntime:()=>Promise<PluginPurchaseRuntime>,options:{now?:()=>number;maxTransitions?:number}={}){
 const clock=options.now??Date.now,now=()=>new Date(clock()).toISOString(),token=crypto.randomUUID();
 const claimed=await changePluginPurchase(store,owner,id,async(_s,flow)=>{if(!active(flow)||flow.runLease&&flow.runLease.until>now())return {value:false};flow.runLease={token,until:new Date(clock()+240000).toISOString()};return {flow,value:true};});if(!claimed)return {status:(await pluginPurchase(store,owner,id)).status};
 const mutate=async(reduce:(s:PluginSnapshot,f:PluginPurchaseWorkflow)=>Promise<void>|void)=>changePluginPurchase(store,owner,id,async(s,flow)=>{if(flow.runLease?.token!==token||flow.runLease.until<=now())return {value:false};await reduce(s,flow);flow.updatedAt=now();return {flow,value:true};});
 const stop=async(reason:NonNullable<PluginPurchaseWorkflow['stopReason']>,message:string)=>mutate((_s,f)=>{f.status='cancelling';f.stopReason??=reason;f.lastError=message;for(const step of f.steps)if(step.status==='pending'&&!step.fundingIntent)step.status='cancelled';});
 try{
  let runtime:PluginPurchaseRuntime|undefined;
  for(let transition=0;transition<(options.maxTransitions??24);transition++){
   let flow=await pluginPurchase(store,owner,id);if(!active(flow)||flow.runLease?.token!==token||flow.runLease.until<=now())return {status:flow.status};
   const step=flow.steps.find(s=>!['paid','refunded','cancelled'].includes(s.status));
   if(!step){await mutate((_s,f)=>{f.status=f.steps.every(s=>s.status==='paid')?'completed':f.stopReason==='owner-cancelled'?'cancelled':'failed';delete f.runLease;});return {status:(await pluginPurchase(store,owner,id)).status};}
   const snapshot=await store.read(owner);let authority:Awaited<ReturnType<typeof permit>>|undefined;
   if(flow.status==='running'&&!step.settlementIntent){try{authority=await permit(store,owner,snapshot,flow,step,now());}catch(error){if(!(error instanceof DomainError)||error.code!=='FORBIDDEN')throw error;await stop(flow.deadlineAt<=now()?'expired':'permission',error.message);continue;}}
   // Cancelling a never-sent step requires neither an RPC nor a live runtime.
   if(flow.status==='cancelling'&&step.status==='pending'&&!step.fundingIntent){await mutate((_s,f)=>{f.steps[step.index].status='cancelled';});continue;}
   runtime??=await getRuntime();const chain=runtime.chain;
   if(step.status==='pending'){
    if(!authority)continue;
    const executor=await runtime.executor();if(executor.descriptor.configHash!==step.runtimeHash){await stop('permission','The reviewed plugin runtime changed.');continue;}
    await runtime.checkSession(authority.session,0);
    const paid=new Map<number,Json>();let parent:PluginPurchaseStep['parent'];
    if(step.input.from==='step'){
     const original=flow.steps[step.input.step];if(original.status!=='paid'||!original.settlement)throw new DomainError('Plugin dependency is not paid.','FORBIDDEN');
     const execution=await acceptedExecution(store,owner,flow,original),receipt=await chain.settlement(flow,original,original.settlement.transactionHash);
     if(receipt.status!=='paid'||receipt.outputHash!==resultHash(execution))throw new DomainError('Plugin parent delivery or canonical payment changed.','CONFLICT');
     paid.set(original.index,execution.output);parent={step:original.index,taskId:original.taskId,transactionHash:receipt.transactionHash,executionDigest:execution.digest};
    }
    let inputValue:Json;try{inputValue=selectPluginPurchaseInput(flow.input,step.input,paid);validatePluginValue(authority.installed.manifest.input,inputValue);}catch{await stop('invalid-delivery','The paid dependency does not match the next plugin input schema.');continue;}
    const block=await chain.client.getBlock(),window=BigInt(Math.max(120,Math.ceil(2*authority.installed.manifest.limits.wallMs/1000)+30)),deadline=block.timestamp+window<BigInt(flow.vault.expires)?block.timestamp+window:BigInt(flow.vault.expires);
    if(deadline<=block.timestamp+20n){await stop('expired','The Vault grant leaves insufficient escrow time.');continue;}
    const inputHash=await digest(inputValue);
    await mutate(async(s,f)=>{await permit(store,owner,s,f,f.steps[step.index],now());const current=f.steps[step.index];if(current.status!=='pending')return;current.inputValue=inputValue;current.inputHash=inputHash;if(parent)current.parent=parent;current.specHash=await digest(pluginPurchaseSpec(f,current)) as `0x${string}`;current.fundingIntent={deadline:deadline.toString(),token:crypto.randomUUID(),until:new Date(clock()+90000).toISOString()};current.status='funding';});continue;
   }
   const view=await chain.view(flow,step);
   if(!step.funding){
    if(view.status!==0){const proof=await chain.funding(flow,step);await mutate((_s,f)=>{const current=f.steps[step.index];if(current.specHash!==step.specHash)throw new DomainError('Plugin funding intent changed.','CONFLICT');current.funding=proof;current.status='funded';});continue;}
    if(!step.fundingIntent)throw new DomainError('Plugin funding intent is unavailable.','CONFLICT');
    if(view.timestamp>=BigInt(step.fundingIntent.deadline)){await mutate((_s,f)=>{const current=f.steps[step.index];current.status='cancelled';current.unfundedProof={blockNumber:view.blockNumber,blockHash:view.blockHash,checkedAt:now()};f.status='cancelling';f.stopReason??='expired';for(const next of f.steps)if(next.status==='pending')next.status='cancelled';});continue;}
    if(flow.status==='cancelling')return {status:'waiting-for-funding-finality'};
    if(!authority){authority=await permit(store,owner,snapshot,flow,step,now());}
    await runtime.checkSession(authority.session,0);const hash=await chain.fund(flow,step,authority.installed.manifest,authority.session),proof=await chain.funding(flow,step,hash);await mutate((_s,f)=>{f.steps[step.index].funding=proof;f.steps[step.index].status='funded';});continue;
   }
   // Revalidate the original principal before executing or settling, including
   // recovery after an HTTP response was lost after the transaction mined.
   await chain.funding(flow,step,step.funding.transactionHash);
   if(view.status===2||view.status===3){
    const proof=await chain.settlement(flow,step);if(proof.status==='paid'){const execution=await acceptedExecution(store,owner,flow,step);if(proof.outputHash!==resultHash(execution))throw new DomainError('Plugin payment output differs from the complete signed delivery.','CONFLICT');}
    await mutate((_s,f)=>{const current=f.steps[step.index];current.settlement=proof;current.settledAt=now();current.outputHash=proof.outputHash;current.status=proof.status==='paid'?'paid':'refunded';if(proof.status==='refunded'){f.status='cancelling';f.stopReason??='invalid-delivery';for(const next of f.steps)if(next.status==='pending')next.status='cancelled';}});continue;
   }
   if(view.status!==1)throw new DomainError('Plugin escrow disappeared before acceptance.','CONFLICT');
   if(view.timestamp>=BigInt(step.fundingIntent!.deadline)&&!step.settlementIntent){await mutate((_s,f)=>{f.steps[step.index].settlementIntent={mode:'reject'};f.steps[step.index].failure='Plugin escrow deadline passed.';f.status='cancelling';f.stopReason??='expired';});continue;}
   if(step.settlementIntent){let execution:PluginExecution|undefined;if(step.settlementIntent.mode==='verify'){execution=await acceptedExecution(store,owner,flow,step);if(execution.digest!==step.settlementIntent.executionDigest)throw new DomainError('Plugin settlement intent differs from its original delivery.','CONFLICT');}await chain.settle(flow,step,execution);continue;}
   if(flow.status==='cancelling'){
    await cancelPluginJob(store,owner,step.jobId).catch(error=>{if(!(error instanceof DomainError)||error.code!=='NOT_FOUND')throw error;});await mutate((_s,f)=>{f.steps[step.index].failure??='Plugin purchase was cancelled or permission changed.';f.steps[step.index].settlementIntent={mode:'reject'};});continue;
   }
   let job;try{job=await pluginJob(store.database,owner,step.jobId);}catch(error){if(!(error instanceof DomainError)||error.code!=='NOT_FOUND')throw error;}
   if(!job){await createPluginJob(store,owner,{action:'create',requestId:step.requestId,pluginId:step.pluginId,manifestHash:step.manifestHash,runtimeHash:step.runtimeHash,input:step.inputValue!,timeoutSeconds:Math.max(30,Math.min(600,Math.ceil((Date.parse(flow.deadlineAt)-clock())/1000)))},flow.runtime,now(),{workflowId:flow.id,step:step.index});await mutate((_s,f)=>{f.steps[step.index].status='executing';});continue;}
   if(job.status==='completed'){
    const execution=await acceptedExecution(store,owner,flow,step);if(authority)await runtime.checkSession(authority.session,0);
    await mutate(async(s,f)=>{try{await permit(store,owner,s,f,f.steps[step.index],now());f.steps[step.index].settlementIntent={mode:'verify',executionDigest:execution.digest};}catch(error){if(!(error instanceof DomainError)||error.code!=='FORBIDDEN')throw error;f.steps[step.index].settlementIntent={mode:'reject'};f.steps[step.index].failure=error.message;f.status='cancelling';f.stopReason??='permission';}});continue;
   }
   if(['failed','cancelled','expired'].includes(job.status)){await stop('invalid-delivery','Plugin execution or its reviewed verifier rejected the result.');continue;}
   const result=await runPluginJob(store,owner,step.jobId,runtime.executor,clock);if(result.status==='retryable'||result.status==='running')return {status:'awaiting-plugin-recovery'};
  }
  return {status:(await pluginPurchase(store,owner,id)).status};
 }catch(error){
  const message=error instanceof DomainError?error.message:'Plugin workflow dependency unavailable; immutable checkpoints retained.';
  if(error instanceof DomainError&&error.code==='FORBIDDEN'){await stop('permission',message).catch(()=>{});return {status:'retryable',error:message};}
  await mutate((_s,f)=>{f.lastError=message;}).catch(()=>{});return {status:'retryable',error:message};
 }finally{await changePluginPurchase(store,owner,id,async(_s,flow)=>{if(flow.runLease?.token!==token)return {value:false};delete flow.runLease;return {flow,value:true};}).catch(()=>{});}
}
