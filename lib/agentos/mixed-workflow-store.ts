import {futurePurchaseReservations} from './purchase-reservations.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {pluginGrant,pluginInstallation,type PluginDatabase} from './plugin-store.ts';
import {pendingPluginPurchaseSlots} from './plugin-purchase-protocol.ts';
import {pluginPurchaseDailyExposure,type PluginPurchaseContext} from './plugin-purchase-store.ts';
import {pluginVaultAllowance,vaultAllowance,assertVaultSeller} from './vault.ts';
import {mixedWorkflowDraftSchema,validateMixedProgram,mixedPluginRuns,mixedStepUUID,mixedTerms,findMixed,type MixedWorkflow,type MixedWorkflowDraft} from './mixed-workflow.ts';
import type {WorkflowSupplierBinding} from './workflow-suppliers.ts';
import type {ServiceDescriptor} from './service-catalog.ts';
import type {Workspace} from './types.ts';
export type MixedStore=PluginDatabase&{updateWorkspace:(owner:string,reduce:(state:Workspace)=>Workspace|Promise<Workspace>)=>Promise<{state:Workspace;scope:string;revision:number}>};
export type MixedCreationContext={plugins:PluginPurchaseContext;catalog:ServiceDescriptor[];bindings:Map<string,WorkflowSupplierBinding>};
export async function createMixedWorkflow(store:MixedStore,owner:string,raw:MixedWorkflowDraft,getContext:()=>Promise<MixedCreationContext>,now=new Date().toISOString()){
 const body=mixedWorkflowDraftSchema.parse(raw),draftHash=await digest(body),id='mixed-'+body.requestId;let context:Promise<MixedCreationContext>|undefined;
 const snapshot=await store.updateWorkspace(owner,async state=>{
  const prior=state.mixedWorkflows?.find(f=>f.id===id);if(prior){if(prior.draftHash!==draftHash)throw new DomainError('Mixed workflow identifier has different parameters.','IDEMPOTENCY_CONFLICT');return state;}
  const c=await(context??=getContext()),selected=await validateMixedProgram(body,c.catalog),deployment=c.plugins.deployment;
  if(deployment.mode!=='local')throw new DomainError('Public mixed workflows are deferred.','FORBIDDEN');
  if(!state.policy.active||(state.mixedWorkflows?.length??0)>=20)throw new DomainError('Mixed workflow permission or history limit reached.','FORBIDDEN');
  if(pluginPurchaseDailyExposure(state,deployment,now)+body.steps.reduce((n,s)=>n+s.maxPriceCents,0)>state.policy.dailyBudget)throw new DomainError('Mixed workflow exceeds the shared daily budget.','FORBIDDEN');
  const pluginCount=selected.filter(s=>s.executor==='plugin').length;
  if((state.pluginJobs?.length??0)+pendingPluginPurchaseSlots(state)+mixedPluginRuns(state)+pluginCount>100)throw new DomainError('Mixed workflow exceeds reserved plugin capacity.','FORBIDDEN');
  if((state.pluginPurchases?.length??0)+mixedPluginRuns(state)+pluginCount>20)throw new DomainError('Mixed workflow exceeds plugin purchase capacity.','FORBIDDEN');
  if((state.chainOrders?.length??0)+futurePurchaseReservations(state,now).length+body.steps.length>300)throw new DomainError('Mixed workflow exceeds order capacity.','FORBIDDEN');
  const gross=selected.reduce((n,s,i)=>n+(s.priceKind==='fixed'?s.priceCents:body.steps[i].maxPriceCents),0),steps:MixedWorkflow['steps']=[];let expiry=Date.parse(now)+body.timeoutSeconds*1000,session;
  for(const [index,service]of selected.entries()){
   const definition=body.steps[index];if(definition.maxPriceCents>state.policy.maxTaskBudget)throw new DomainError('Mixed step exceeds the current per-task limit.','FORBIDDEN');
   let grantEpoch:number|undefined,supplierBinding:WorkflowSupplierBinding|undefined;
   if(service.executor==='plugin'){
    const pluginId=service.binding.pluginId!,grant=await pluginGrant(store.database,owner,pluginId),installed=await pluginInstallation(store.database,owner,pluginId),occurrences=selected.filter(s=>s.binding.pluginId===pluginId).length;
    if(!installed||installed.manifestHash!==service.binding.manifestHash||!grant?.enabled||grant.manifestHash!==installed.manifestHash||grant.runtimeHash!==service.binding.runtimeHash||grant.expiresAt<=now||grant.used+mixedPluginRuns(state,pluginId)+occurrences>grant.maxRuns)throw new DomainError('Mixed workflow requires available exact plugin execution grants.','FORBIDDEN');
    session=pluginVaultAllowance(state,body.vaultSessionId,body.buyer as `0x${string}`,{pluginId,manifestHash:installed.manifestHash,runtimeHash:service.binding.runtimeHash!,maxPriceCents:definition.maxPriceCents},definition.maxPriceCents,gross,now);grantEpoch=grant.epoch;expiry=Math.min(expiry,Date.parse(grant.expiresAt));
   }else{
    const agent=state.agents.find(a=>a.id===service.binding.agentId);
    if(!agent?.enabled||agent.skill!==service.binding.skill||!state.policy.allowedSkills.includes(agent.skill)||service.executor==='builtin'&&agent.price!==service.priceCents)throw new DomainError('Mixed business service changed.','FORBIDDEN');
    session=vaultAllowance(state,body.vaultSessionId,body.buyer as `0x${string}`,agent.skill,definition.maxPriceCents,gross,now);
    if(service.executor==='supplier'){supplierBinding=c.bindings.get(service.id);if(!supplierBinding)throw new DomainError('Mixed supplier binding is unavailable.','FORBIDDEN');assertVaultSeller(session,supplierBinding.identity.wallet);}else assertVaultSeller(session,deployment.seller);
   }
   if(session.scope!==await digest({workspace:owner}))throw new DomainError('Mixed workflow session belongs to another workspace.','FORBIDDEN');expiry=Math.min(expiry,Number(session.expires)*1000);
   steps.push({requestId:await mixedStepUUID(body.requestId,index),service:structuredClone(service),maxPriceCents:definition.maxPriceCents,quote:service.priceKind==='fixed'?service.priceCents:definition.maxPriceCents,input:definition.input,status:'pending',...(grantEpoch===undefined?{}:{grantEpoch}),...(supplierBinding?{supplierBinding:structuredClone(supplierBinding)}:{})});
  }
  if(expiry-Date.parse(now)<60000)throw new DomainError('Mixed permissions leave insufficient execution time.','FORBIDDEN');await c.plugins.checkSession(session!,gross);
  const f:MixedWorkflow={version:'agentos.mixed-workflow.v1',id,scope:await digest({workspace:owner}),requestId:body.requestId,draftHash,termsHash:'',title:body.title,buyer:body.buyer as `0x${string}`,vaultSessionId:body.vaultSessionId,deployment,input:body.input,totalBudget:body.totalBudget,timeoutSeconds:body.timeoutSeconds,createdAt:now,deadlineAt:new Date(expiry).toISOString(),updatedAt:now,status:'running',steps};f.termsHash=await digest(mixedTerms(f));if(new TextEncoder().encode(JSON.stringify([f,...state.mixedWorkflows??[]])).length>524288)throw new DomainError('Mixed workflow history exceeds its storage bound.');
  return {...state,mixedWorkflows:[f,...state.mixedWorkflows??[]]};
 });return findMixed(snapshot.state,id);
}
export function cancelMixedWorkflow(state:Workspace,id:string,now=new Date().toISOString()){
 const prior=findMixed(state,id);if(['completed','cancelled','failed'].includes(prior.status))return state;const next=structuredClone(state),f=findMixed(next,id);f.status='cancelling';delete f.lease;f.updatedAt=now;f.lastError='Mixed workflow cancelled by its owner.';for(const step of f.steps)if(!step.childId)step.status='cancelled';return next;
}
