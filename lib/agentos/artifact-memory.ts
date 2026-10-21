import {z} from 'zod';
import {acceptedMemoryRecords,canonical,verifyDelivery,MAX_MEMORY_DEPTH,MAX_MEMORY_NODES,type AcceptedArtifact,type AcceptedMemory} from '../../cre/workflow/verify.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import {DomainError} from './engine.ts';
import {orderArtifact,type ChainOrder} from './orders.ts';
import type {TaskInput,Workspace} from './types.ts';
import type {OrderChain} from './order-chain.ts';

export const acceptedArtifactSchema=z.custom<AcceptedMemory>(value=>{try{acceptedMemoryRecords(value);return true;}catch{return false;}},'Invalid accepted artifact memory.');
export function acceptedArtifact(order:ChainOrder):AcceptedArtifact{
 if(order.status!=='completed'||!order.output||order.failure||order.settlement?.status!=='paid'||order.settlement.phase!=='settlement'||!order.spec.verification)throw new DomainError('A completed, paid, independently accepted artifact is required for memory.','FORBIDDEN');
 const legacy=order.skill==='treasury-report'&&!order.input.memory;
 const bytes=inputEvidence(order,order.buyer),memory:AcceptedArtifact={version:legacy?'agentos.accepted-artifact.v1':'agentos.accepted-artifact.v2',...(!legacy?{projection:order.skill==='treasury-report'?'allocations.v1' as const:order.skill==='event-analysis'?'summary-total.v1' as const:'ranked-accounts.v1' as const}:{}),orderId:order.id,chainId:order.deployment.chainId,escrow:order.deployment.escrow,taskId:bytes.id,settlementTransactionHash:order.settlement.transactionHash,artifactHash:order.settlement.outputHash,datasetText:bytes.datasetText,artifactText:orderArtifact(order,bytes.id),spec:order.spec};
 try{acceptedMemoryRecords(memory);}catch{throw new DomainError('Parent artifact does not pass complete acceptance.','FORBIDDEN');}return memory;
}
export function acceptedArtifactInput(order:ChainOrder):TaskInput{
 const memory=acceptedArtifact(order);return {dataset:'custom-transfers-v1',blockFrom:0,blockTo:0,records:acceptedMemoryRecords(memory),memory};
}
export function mergedArtifactInput(orders:ChainOrder[]):TaskInput{
 const memory={version:'agentos.accepted-merge.v1' as const,strategy:'concat-projections.v1' as const,parents:orders.map(acceptedArtifact)};
 try{return {dataset:'custom-transfers-v1',blockFrom:0,blockTo:0,records:acceptedMemoryRecords(memory),memory};}catch{throw new DomainError('Merged input requires distinct, bounded paid artifact projections.','FORBIDDEN');}
}
/** The embedded envelope proves arithmetic, not ownership/payment; require the scoped original. */
export function memoryParents(state:Workspace,order:Pick<ChainOrder,'input'|'buyer'|'deployment'>){
 const memory=order.input.memory;if(!memory)return [];
 try{acceptedMemoryRecords(memory);}catch{throw new DomainError('Accepted memory does not pass complete acceptance.','FORBIDDEN');}
 return (memory.version==='agentos.accepted-merge.v1'?memory.parents:[memory]).map(artifact=>{
  const parent=state.chainOrders?.find(o=>o.id===artifact.orderId);
  if(!parent||parent.buyer.toLowerCase()!==order.buyer.toLowerCase()||canonical(parent.deployment)!==canonical(order.deployment)||canonical(acceptedArtifact(parent))!==canonical(artifact))throw new DomainError('Accepted memory is not a paid order owned by this workspace and buyer.','FORBIDDEN');return parent;
 });
}
export function memoryParent(state:Workspace,order:Pick<ChainOrder,'input'|'buyer'|'deployment'>){return memoryParents(state,order)[0]??null;}
export async function verifyMemoryAuthority(state:Workspace,order:Pick<ChainOrder,'input'|'buyer'|'deployment'>,chain:OrderChain){
 const verified=new Set<string>();for(const parent of memoryParents(state,order))await verifyMemoryLineage(state,parent,chain,new Set(),0,verified);
}
/** Validate results even when their output has no nonempty transfer projection. */
export async function verifyAcceptedOrder(state:Workspace,order:ChainOrder,chain:OrderChain){
 if(order.status!=='completed'||!order.output||order.failure||order.settlement?.status!=='paid'||order.settlement.phase!=='settlement'||!order.spec.verification)throw new DomainError('A completed, paid, independently accepted artifact is required.','FORBIDDEN');
 const bytes=inputEvidence(order,order.buyer);
 try{const text=orderArtifact(order,bytes.id),verdict=verifyDelivery(bytes.datasetText,text,bytes.id,order.spec);if(canonical(JSON.parse(text).output)!==canonical(order.output)||!verdict.accepted||verdict.outputHash!==order.settlement.outputHash)throw new Error();}catch{throw new DomainError('Paid output does not pass complete acceptance.','FORBIDDEN');}
 await verifyMemoryLineage(state,order,chain,new Set(),0,new Set());
}
async function verifyMemoryLineage(state:Workspace,parent:ChainOrder,chain:OrderChain,seen:Set<string>,depth:number,verified:Set<string>):Promise<void>{
 if(depth>=MAX_MEMORY_DEPTH||seen.has(parent.id)||verified.size>=MAX_MEMORY_NODES)throw new DomainError('Accepted memory lineage exceeds its limit.','FORBIDDEN');if(verified.has(parent.id))return;
 seen.add(parent.id);
 for(const ancestor of memoryParents(state,parent))await verifyMemoryLineage(state,ancestor,chain,seen,depth+1,verified);
 const evidence=await chain.settlement(parent,parent.settlement!.transactionHash);
 if(evidence.status!=='paid'||canonical(evidence)!==canonical(parent.settlement)){
  // Confirmation counts can grow; compare the immutable payment, not observation metadata.
  if(evidence.status!=='paid'||['transactionHash','blockHash','taskId','outputHash','buyer','seller','amount','specHash','chainId','escrow','token'].some(key=>String(evidence[key as keyof typeof evidence]).toLowerCase()!==String(parent.settlement![key as keyof typeof evidence]).toLowerCase()))throw new DomainError('Accepted memory payment is no longer canonical.','FORBIDDEN');
 }
 seen.delete(parent.id);verified.add(parent.id);
}
export function acceptedOrderMemories(state:Workspace){
 return (state.chainOrders??[]).flatMap(order=>{try{const memory=acceptedArtifact(order);return [{orderId:order.id,title:order.title,agentId:order.agentId,skill:order.skill,settledAt:order.settledAt,artifactHash:memory.artifactHash,settlementTransactionHash:memory.settlementTransactionHash}];}catch{return [];}});
}
