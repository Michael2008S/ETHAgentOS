import {verifySelectedPluginMemory} from './plugin-semantic-memory.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError,resolveSkillInput} from './engine.ts';
import {findOrder,createOrder,orderEvent} from './orders.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import {acceptedArtifactInput,verifyAcceptedOrder} from './artifact-memory.ts';
import {canonicalPluginPaidRoot,readPluginFlow} from './plugin-paid-memory.ts';
import {createPluginPurchase,cancelPluginPurchase,pluginPurchase} from './plugin-purchase-store.ts';
import {runPluginPurchase,type PluginPurchaseRuntime} from './plugin-purchase-runner.ts';
import {runOrder} from './order-runner.ts';
import {makeSupplierQuoteRequest,verifySupplierQuote} from './supplier-quote.ts';
import {pluginGrant,pluginJob} from './plugin-store.ts';
import {findMixed,verifyMixed,handoffMixed,businessSummary,mixedAdapterValue,type MixedWorkflow,type MixedStep} from './mixed-workflow.ts';
import type {MixedStore,MixedCreationContext} from './mixed-workflow-store.ts';
import type {OrderChain} from './order-chain.ts';
import type {EvidencePublisher} from './workflows.ts';
import type {WorkflowSupplierAccess} from './workflow-suppliers.ts';
import type {Workspace,TaskInput} from './types.ts';
import type {Json} from './plugin-protocol.ts';

export type MixedRuntime={chain:OrderChain;publish:EvidencePublisher;orderOptions:NonNullable<Parameters<typeof runOrder>[4]>;suppliers:WorkflowSupplierAccess;pluginContext:()=>Promise<MixedCreationContext['plugins']>;plugins:()=>Promise<PluginPurchaseRuntime>;checkInput:(input:TaskInput)=>Promise<void>};
async function paidStep(store:MixedStore,owner:string,state:Workspace,f:MixedWorkflow,index:number,r:MixedRuntime):Promise<{json:Json;business?:TaskInput;proof:NonNullable<MixedStep['parent']>}>{
 const step=f.steps[index];if(step.status!=='paid'||!step.childId)throw new DomainError('Mixed parent has no accepted payment.','FORBIDDEN');
 if(step.service.executor==='plugin'){
  const child=await readPluginFlow(store,owner,step.childId),s=child.steps[0];if(child.buyer.toLowerCase()!==f.buyer.toLowerCase()||child.requestId!==step.requestId||!s.settlement||!s.outputHash)throw new DomainError('Mixed plugin parent differs.','FORBIDDEN');
  const result=await canonicalPluginPaidRoot(store,owner,{workflowId:child.id,step:0,taskId:s.taskId,settlementTransactionHash:s.settlement.transactionHash,executionDigest:(await pluginJob(store.database,owner,s.jobId)).execution!.digest},(await r.plugins()).chain,f.buyer);
  return {json:result.execution.output,proof:{kind:'plugin' as const,id:child.id,step:0,payment:result.settlement.transactionHash,artifactHash:result.execution.digest}};
 }
 const order=findOrder(state,step.childId);if(order.requestId!==step.requestId||order.workflowId!==f.id||order.buyer.toLowerCase()!==f.buyer.toLowerCase()||canonical(order.deployment)!==canonical(f.deployment))throw new DomainError('Mixed business parent differs.','FORBIDDEN');
 await verifyAcceptedOrder(state,order,r.chain);return {json:businessSummary(order.skill,order.output!),business:acceptedArtifactInput(order),proof:{kind:'order' as const,id:order.id,payment:order.settlement!.transactionHash,artifactHash:order.settlement!.outputHash}};
}
async function inputFor(store:MixedStore,owner:string,state:Workspace,f:MixedWorkflow,index:number,r:MixedRuntime){
 const memory=f.memory?await verifySelectedPluginMemory(store,owner,f.memory,f.scope,f.buyer,f.input,(await r.plugins()).chain,false):undefined;
 const root=memory?{json:memory.execution.output,business:undefined as TaskInput|undefined,proof:{kind:'plugin' as const,id:memory.flow.id,step:memory.step.index,payment:memory.settlement.transactionHash,artifactHash:memory.execution.digest}}:undefined;
 const step=f.steps[index],source=step.input.from==='step'?await paidStep(store,owner,state,f,step.input.step!,r):root;
 const value=step.input.adapter==='business-transfers.v1'?source?.business:mixedAdapterValue(step.input,source?.json??f.input);
 if(value===undefined)throw new DomainError('The selected mixed adapter has no compatible paid input.','FORBIDDEN');
 if(step.parent&&canonical(step.parent)!==canonical(source?.proof))throw new DomainError('Mixed canonical parent payment changed.','CONFLICT');
 return {value,hash:await digest(value),parent:source?.proof};
}
async function permit(store:MixedStore,owner:string,state:Workspace,f:MixedWorkflow,step:MixedStep){
 const session=state.vaultSessions?.find(s=>s.sessionId===f.vaultSessionId);
 if(!state.policy.active||!session?.signature||session.revokedAt||session.scope!==f.scope||session.owner.toLowerCase()!==f.buyer.toLowerCase()||Number(session.expires)*1000<=Date.now()||f.deadlineAt<=new Date().toISOString()||step.maxPriceCents>state.policy.maxTaskBudget)throw new DomainError('Mixed workflow permission or deadline changed.','FORBIDDEN');
 if(step.service.executor==='plugin'){
  const g=await pluginGrant(store.database,owner,step.service.binding.pluginId!);if(!g?.enabled||g.epoch!==step.grantEpoch||g.expiresAt<=new Date().toISOString()||g.manifestHash!==step.service.binding.manifestHash||g.runtimeHash!==step.service.binding.runtimeHash)throw new DomainError('The original mixed plugin grant changed.','FORBIDDEN');
 }else{const a=state.agents.find(a=>a.id===step.service.binding.agentId);if(!a?.enabled||!state.policy.allowedSkills.includes(a.skill)||a.skill!==step.service.binding.skill||step.service.executor==='builtin'&&a.price!==step.quote)throw new DomainError('The mixed business service changed.','FORBIDDEN');}
 return session;
}
export async function runMixedWorkflow(store:MixedStore,owner:string,id:string,getRuntime:()=>Promise<MixedRuntime>,maxTransitions=4){
 const token=crypto.randomUUID(),now=()=>new Date().toISOString();
 const claim=await store.updateWorkspace(owner,async state=>{const original=findMixed(state,id);await verifyMixed(original);if(!['running','cancelling'].includes(original.status)||original.lease&&original.lease.until>now())return state;const next=structuredClone(state);findMixed(next,id).lease={token,until:new Date(Date.now()+240000).toISOString()};return next;});
 if(findMixed(claim.state,id).lease?.token!==token)return {status:findMixed(claim.state,id).status};
 const mutate=(reduce:(state:Workspace,f:MixedWorkflow)=>void|Promise<void>)=>store.updateWorkspace(owner,async state=>{const old=findMixed(state,id);if(old.lease?.token!==token||old.lease.until<=now())throw new DomainError('Mixed drive lease changed.','CONFLICT');const next=structuredClone(state),f=findMixed(next,id);await reduce(next,f);f.updatedAt=now();return next;});
 let runtime:MixedRuntime|undefined;
 try{for(let tick=0;tick<maxTransitions;tick++){
  const snapshot=await store.read(owner),f=findMixed(snapshot.state,id);if(f.lease?.token!==token)return {status:f.status};await verifyMixed(f);
  const index=f.steps.findIndex(s=>!['paid','cancelled','failed'].includes(s.status));
  if(index<0){await mutate((_s,w)=>{w.status=w.steps.every(s=>s.status==='paid')?'completed':w.lastError==='Mixed workflow cancelled by its owner.'?'cancelled':'failed';});return {status:findMixed((await store.read(owner)).state,id).status};}
  const step=f.steps[index];
  if(f.status==='running')try{await permit(store,owner,snapshot.state,f,step);}catch(error){if(!(error instanceof DomainError))throw error;await mutate((_s,w)=>{w.status='cancelling';w.lastError=error.message;for(const s of w.steps)if(!s.childId)s.status='cancelled';});continue;}
  if(f.status==='cancelling'&&!step.childId){await mutate((_s,w)=>{w.steps[index].status='cancelled';});continue;}
  runtime??=await getRuntime();const r=runtime;
  if(!step.childId){
   const input=await inputFor(store,owner,snapshot.state,f,index,r),reference={id,index,token,parent:input.parent};
   if(step.service.executor==='plugin'){
    await createPluginPurchase(store,owner,{requestId:step.requestId,title:f.title+' · '+(index+1),buyer:f.buyer,vaultSessionId:f.vaultSessionId,input:input.value as Json,steps:[{pluginId:step.service.binding.pluginId!,manifestHash:step.service.binding.manifestHash!,runtimeHash:step.service.binding.runtimeHash!,maxPriceCents:step.maxPriceCents,input:{from:'root',path:[]}}],totalBudget:step.maxPriceCents,timeoutSeconds:Math.max(60,Math.min(f.timeoutSeconds,Math.floor((Date.parse(f.deadlineAt)-Date.now())/1000)))},r.pluginContext,undefined,undefined,reference);
   }else{
    const businessInput=resolveSkillInput(snapshot.state,step.service.binding.skill as import('./types.ts').Skill,input.value as TaskInput);await r.checkInput(businessInput);let supplierQuote:import('./supplier-quote.ts').SupplierQuote|undefined;
    if(step.supplierBinding){const session=await permit(store,owner,snapshot.state,f,step);await r.suppliers.authorize(step.supplierBinding);const request=await makeSupplierQuoteRequest({requestId:step.requestId,workspaceHash:f.scope,buyer:f.buyer,payer:session.vault,agentId:step.service.binding.agentId!,skill:step.service.binding.skill as import('./types.ts').Skill,input:businessInput,identity:step.supplierBinding.identity,deployment:f.deployment,supplier:step.supplierBinding.supplier});supplierQuote=await verifySupplierQuote(await r.suppliers.quote(step.supplierBinding,request),request,step.supplierBinding.supplier,await r.suppliers.chainTime());if(supplierQuote.payload.priceCents>step.maxPriceCents)throw new DomainError('Mixed supplier quote exceeds its approved ceiling.','FORBIDDEN');}
    const bytes=inputEvidence({id:'chain-'+step.requestId,skill:step.service.binding.skill as import('./types.ts').Skill,input:businessInput},f.buyer),spec=await r.publish(bytes);
    await store.updateWorkspace(owner,async current=>{const prepared=handoffMixed(current,reference,'chain-'+step.requestId,input.hash,input.parent);return createOrder(prepared,{workflowId:id,requestId:step.requestId,title:f.title+' · '+(index+1),agentId:step.service.binding.agentId!,buyer:f.buyer,vaultSessionId:f.vaultSessionId,budget:step.maxPriceCents,input:businessInput,spec,scenario:'success',timeoutSeconds:Math.max(30,Math.min(f.timeoutSeconds,Math.floor((Date.parse(f.deadlineAt)-Date.now())/1000))),...(supplierQuote?{executor:'supplier',supplierQuote,supplier:step.supplierBinding!.supplier,agentIdentity:step.supplierBinding!.identity}:{})},f.deployment,now(),{workspaceHash:f.scope,now:await r.suppliers.chainTime()});});
   }continue;
  }
  if(f.status==='running')await inputFor(store,owner,snapshot.state,f,index,r);
  if(step.service.executor==='plugin'){
   if(f.status==='cancelling')await cancelPluginPurchase(store,owner,step.childId);
   await runPluginPurchase(store,owner,step.childId,r.plugins,{maxTransitions:12});const child=await pluginPurchase(store,owner,step.childId),s=child.steps[0];
   if(s.status==='paid'){await mutate((_s,w)=>{w.steps[index].status='paid';w.steps[index].outputHash=s.outputHash;w.steps[index].payment=s.settlement!.transactionHash;});continue;}
   if(['failed','cancelled'].includes(child.status)){await mutate((_s,w)=>{w.steps[index].status='failed';w.status='cancelling';w.lastError??=child.lastError??'Mixed plugin step did not produce a paid result.';for(const next of w.steps)if(!next.childId)next.status='cancelled';});continue;}
  }else{
   if(f.status==='cancelling')await mutate((state)=>{const o=findOrder(state,step.childId!);if(o.settlement||o.settlementAuthorization)return;if(!o.funding&&!o.vaultFunding)o.status='cancelled';else if(o.funding){o.failure='Mixed workflow cancelled.';o.status='awaiting-settlement';orderEvent(o,'Mixed workflow stopped','Existing funding will settle or refund under its original intent.');}});
   await runOrder(store,owner,step.childId,r.chain,{...r.orderOptions,maxSteps:6,delayMs:0});const order=findOrder((await store.read(owner)).state,step.childId);
   if(order.status==='completed'&&order.settlement?.status==='paid'){await verifyAcceptedOrder((await store.read(owner)).state,order,r.chain);await mutate((_s,w)=>{w.steps[index].status='paid';w.steps[index].outputHash=order.settlement!.outputHash;w.steps[index].payment=order.settlement!.transactionHash;});continue;}
   if(['refunded','cancelled'].includes(order.status)){await mutate((_s,w)=>{w.steps[index].status='failed';w.status='cancelling';w.lastError??=order.failure??'Mixed skill step did not produce a paid result.';for(const next of w.steps)if(!next.childId)next.status='cancelled';});continue;}
  }
  return {status:'running'};
 }return {status:findMixed((await store.read(owner)).state,id).status};
 }catch(error){const message=error instanceof DomainError?error.message:'Mixed dependency unavailable; original checkpoints retained.';await mutate((_s,w)=>{w.lastError=message;if(error instanceof DomainError&&['FORBIDDEN','MODEL_REJECTED'].includes(error.code)){w.status='cancelling';for(const step of w.steps)if(!step.childId)step.status='cancelled';}}).catch(()=>{});return {status:'retryable',error:message};
 }finally{await store.updateWorkspace(owner,state=>{const original=findMixed(state,id);if(original.lease?.token!==token)return state;const next=structuredClone(state);delete findMixed(next,id).lease;return next;}).catch(()=>{});}
}
