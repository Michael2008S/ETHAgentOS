import {z} from 'zod';
import {acceptedMemoryRecords,canonical,type AcceptedArtifact} from '../../cre/workflow/verify.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import {DomainError} from './engine.ts';
import {orderArtifact,type ChainOrder} from './orders.ts';
import type {TaskInput,Workspace} from './types.ts';
import type {OrderChain} from './order-chain.ts';

export const acceptedArtifactSchema=z.custom<AcceptedArtifact>(value=>{try{acceptedMemoryRecords(value);return true;}catch{return false;}},'Invalid accepted artifact memory.');
export function acceptedArtifact(order:ChainOrder):AcceptedArtifact{
 if(order.status!=='completed'||order.skill!=='treasury-report'||!order.output||order.failure||order.settlement?.status!=='paid'||order.settlement.phase!=='settlement'||!order.spec.verification||order.input.memory)throw new DomainError('A completed, paid treasury report is required for memory.','FORBIDDEN');
 const bytes=inputEvidence(order,order.buyer),memory:AcceptedArtifact={version:'agentos.accepted-artifact.v1',orderId:order.id,chainId:order.deployment.chainId,escrow:order.deployment.escrow,taskId:bytes.id,settlementTransactionHash:order.settlement.transactionHash,artifactHash:order.settlement.outputHash,datasetText:bytes.datasetText,artifactText:orderArtifact(order,bytes.id),spec:order.spec};
 try{acceptedMemoryRecords(memory);}catch{throw new DomainError('Parent artifact does not pass complete acceptance.','FORBIDDEN');}return memory;
}
export function acceptedArtifactInput(order:ChainOrder):TaskInput{
 const memory=acceptedArtifact(order);return {dataset:'custom-transfers-v1',blockFrom:0,blockTo:0,records:acceptedMemoryRecords(memory),memory};
}
/** The embedded envelope proves arithmetic, not ownership/payment; require the scoped original. */
export function memoryParent(state:Workspace,order:Pick<ChainOrder,'input'|'buyer'|'deployment'>){
 const memory=order.input.memory;if(!memory)return null;
 const parent=state.chainOrders?.find(o=>o.id===memory.orderId);
 if(!parent||parent.buyer.toLowerCase()!==order.buyer.toLowerCase()||canonical(parent.deployment)!==canonical(order.deployment)||canonical(acceptedArtifact(parent))!==canonical(memory))throw new DomainError('Accepted memory is not a paid order owned by this workspace and buyer.','FORBIDDEN');
 return parent;
}
export async function verifyMemoryAuthority(state:Workspace,order:Pick<ChainOrder,'input'|'buyer'|'deployment'>,chain:OrderChain){
 const parent=memoryParent(state,order);if(!parent)return;
 const evidence=await chain.settlement(parent,parent.settlement!.transactionHash);
 if(evidence.status!=='paid'||canonical(evidence)!==canonical(parent.settlement)){
  // Confirmation counts can grow; compare the immutable payment, not observation metadata.
  if(evidence.status!=='paid'||['transactionHash','blockHash','taskId','outputHash','buyer','seller','amount','specHash','chainId','escrow','token'].some(key=>String(evidence[key as keyof typeof evidence]).toLowerCase()!==String(parent.settlement![key as keyof typeof evidence]).toLowerCase()))throw new DomainError('Accepted memory payment is no longer canonical.','FORBIDDEN');
 }
}
export function acceptedOrderMemories(state:Workspace){
 return (state.chainOrders??[]).flatMap(order=>{try{const memory=acceptedArtifact(order);return [{orderId:order.id,title:order.title,agentId:order.agentId,skill:order.skill,settledAt:order.settledAt,artifactHash:memory.artifactHash,settlementTransactionHash:memory.settlementTransactionHash}];}catch{return [];}});
}
