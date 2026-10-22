
import {digest,DomainError} from './engine.ts';
import {findMixed,mixedTerms,verifyMixed,type MixedWorkflowDraft} from './mixed-workflow.ts';
import {paidMixedStep,type MixedRuntime} from './mixed-workflow-runner.ts';
import {readPluginFlow} from './plugin-paid-memory.ts';
import type {MixedStore} from './mixed-workflow-store.ts';
import type {Workspace} from './types.ts';
import type {ServiceDescriptor} from './service-catalog.ts';
export async function inspectMixedRepair(store:MixedStore,owner:string,state:Workspace,id:string,r:MixedRuntime){
 const source=findMixed(state,id);await verifyMixed(source);if(!['failed','cancelled'].includes(source.status)||source.repairedBy)throw new DomainError('Select an unreplaced terminal mixed workflow.','FORBIDDEN');let prefix=0;while(source.steps[prefix]?.status==='paid')prefix++;
 let grossSpent=0;const seen=new Set<string>();let cursor=source;for(let depth=0;;depth++){
  if(depth>=20)throw new DomainError('Mixed repair lineage limit reached.');await verifyMixed(cursor);
  for(const [i,step]of cursor.steps.entries()){if(!step.childId||seen.has(step.childId))continue;seen.add(step.childId);if(step.status==='paid'){await paidMixedStep(store,owner,state,cursor,i,r);grossSpent+=step.quote;continue;}
   if(step.service.executor==='plugin'){const child=await readPluginFlow(store,owner,step.childId),s=child.steps[0];if(!['failed','cancelled','completed'].includes(child.status)||s.fundingIntent&&!s.funding)throw new DomainError('Reconcile pending plugin funding before repair.','FORBIDDEN');if(s.funding){if(!s.settlement)throw new DomainError('Reconcile plugin refund before repair.','FORBIDDEN');const chain=(await r.plugins()).chain;await chain.funding(child,s,s.funding.transactionHash);if((await chain.settlement(child,s,s.settlement.transactionHash)).status!=='refunded')throw new DomainError('A canonical refund is required.','FORBIDDEN');grossSpent+=s.priceCents;}}
   else{const order=state.chainOrders?.find(o=>o.id===step.childId);if(!order||!['refunded','cancelled'].includes(order.status)||order.vaultFunding&&!order.funding)throw new DomainError('Reconcile pending skill funding before repair.','FORBIDDEN');if(order.funding){if(!r.chain.refundFinality)throw new DomainError('Refund finality verification unavailable.','UNAVAILABLE');await r.chain.refundFinality(order);grossSpent+=order.quote;}}
  }
  if(!cursor.repair)break;cursor=findMixed(state,cursor.repair.sourceId);
 }
 const snapshotHash=await digest({terms:mixedTerms(source),status:source.status,steps:source.steps});return {source,prefix,grossSpent,snapshotHash};
}
export async function mixedRepairPreview(store:MixedStore,owner:string,state:Workspace,id:string,r:MixedRuntime,catalog:ServiceDescriptor[],replacement?:string,reviewedCeiling?:number){
 const context=await inspectMixedRepair(store,owner,state,id,r),{source,prefix,grossSpent,snapshotHash}=context;if(prefix>=source.steps.length)throw new DomainError('This workflow has no remaining steps.');const steps=source.steps.map(s=>({serviceId:s.service.id,serviceDigest:s.service.digest,maxPriceCents:s.maxPriceCents,input:s.input}));if(replacement){const service=catalog.find(s=>s.id===replacement);if(!service)throw new DomainError('Replacement service unavailable.');steps[prefix]={...steps[prefix],serviceId:service.id,serviceDigest:service.digest,maxPriceCents:service.priceCents};}
 const newCost=steps.slice(prefix).reduce((n,s)=>n+s.maxPriceCents,0),goalBudget=reviewedCeiling??source.repair?.goalBudget??grossSpent+newCost;if(!Number.isSafeInteger(goalBudget)||goalBudget<1||goalBudget>1000000||goalBudget<(source.repair?.goalBudget??0))throw new DomainError('Review a valid cumulative ceiling at least as large as the prior ceiling.');if(grossSpent+newCost>goalBudget)throw new DomainError('Replacement exceeds the original cumulative repair ceiling.','FORBIDDEN');
 const draft:MixedWorkflowDraft={requestId:crypto.randomUUID(),title:'Repair · '+source.title.slice(0,105),buyer:source.buyer,vaultSessionId:crypto.randomUUID(),input:source.input,...(source.memory?{memory:source.memory}:{}),steps,totalBudget:steps.reduce((n,s)=>n+s.maxPriceCents,0),timeoutSeconds:600,repair:{sourceId:id,snapshotHash,prefixLength:prefix,grossSpent,goalBudget}};return draft;
}
export const mixedNewCost=(draft:MixedWorkflowDraft)=>draft.steps.slice(draft.repair?.prefixLength??0).reduce((n,s)=>n+s.maxPriceCents,0);
