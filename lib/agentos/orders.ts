import type { Address, Hex } from 'viem';
import type { WalletDeployment } from '../../sdk/wallet.ts';
import type { ChainEvidence } from '../../sdk/chain.ts';
import { canonical, type DeliverySpec } from '../../cre/workflow/verify.ts';
import { authorizeOperation, digest, DomainError, expectedOutput, normalizeInput } from './engine.ts';
import type { Event, Policy, Scenario, Skill, TaskInput, Workspace } from './types.ts';
export type OrderStatus='awaiting-funding'|'queued'|'running'|'awaiting-settlement'|'paused'|'completed'|'refunded'|'cancelled';
export type ChainOrder={id:string;requestId:string;title:string;agentId:string;skill:Skill;quote:number;budget:number;buyer:Address;deployment:WalletDeployment;spec:DeliverySpec;input:TaskInput;inputHash:string;scenario:Scenario;timeoutSeconds:number;status:OrderStatus;step:number;createdAt:string;updatedAt:string;deadlineAt?:string;chainDeadline?:string;settledAt?:string;lastError?:string;output:Record<string,unknown>|null;outputHash:string|null;failure:string|null;funding:ChainEvidence|null;settlement:ChainEvidence|null;policySnapshot:Policy|null;events:Event[];authorization?:{nonce:string;message:string;expiresAt:string;transactionHash:Hex};settlementAuthorization?:{artifactText:string;authorizedAt:string;policyHash:string}};
export type OrderDraft={requestId:string;title:string;agentId:string;budget:number;buyer:Address;spec:DeliverySpec;input?:TaskInput;scenario:Scenario;timeoutSeconds:number};
export const pendingOrders=(state:Workspace)=>(state.chainOrders??[]).filter(o=>['queued','running','awaiting-settlement'].includes(o.status));
export function orderEvent(o:ChainOrder,title:string,detail:string,now=new Date().toISOString(),level:Event['level']='info'){
  o.events.push({id:`${o.id}:${o.events.length}`,at:now,title,detail,level,step:o.step});o.updatedAt=now;
}
export function orderPolicy(state:Workspace,order:ChainOrder,now:string){
  if(!state.policy.active)return 'Execution permission has been revoked.';
  if(!state.agents.find(a=>a.id===order.agentId)?.enabled)return 'Agent is disabled.';
  if(!state.policy.allowedSkills.includes(order.skill))return 'Skill is outside the current allowlist.';
  if(order.budget>state.policy.maxTaskBudget)return 'Task budget exceeds the current per-task limit.';
  const used=(state.chainOrders??[]).filter(o=>o.id!==order.id&&o.deployment.chainId===order.deployment.chainId&&o.deployment.token.toLowerCase()===order.deployment.token.toLowerCase()&&o.funding).reduce((sum,o)=>sum+(o.settlement?.status==='paid'?(o.settledAt?.slice(0,10)===now.slice(0,10)?o.quote:0):!o.settlement?o.budget:0),0);
  if(used+order.budget>state.policy.dailyBudget)return 'Onchain daily allowance, including funded orders, would be exceeded.';
  return null;
}
export async function createOrder(state:Workspace,draft:OrderDraft,deployment:WalletDeployment,now=new Date().toISOString()):Promise<Workspace>{
  const input=normalizeInput(draft.input),prior=state.chainOrders?.find(o=>o.requestId===draft.requestId);
  const parameters={...draft,input};
  if(prior){
    const previous={requestId:prior.requestId,title:prior.title,agentId:prior.agentId,budget:prior.budget,buyer:prior.buyer,spec:prior.spec,input:prior.input,scenario:prior.scenario,timeoutSeconds:prior.timeoutSeconds};
    if(canonical(previous)!==canonical(parameters)||canonical(prior.deployment)!==canonical(deployment))throw new DomainError('Request ID was already used with different chain order parameters.','IDEMPOTENCY_CONFLICT');return state;
  }
  if((state.chainOrders?.length??0)>=300)throw new DomainError('This prototype supports up to 300 onchain orders per workspace.');
  const agent=state.agents.find(a=>a.id===draft.agentId);
  if(!agent?.enabled)throw new DomainError('An enabled service is required.');
  if(!Number.isSafeInteger(draft.budget)||draft.budget<agent.price||draft.budget>1000000||!Number.isSafeInteger(draft.timeoutSeconds)||draft.timeoutSeconds<1||draft.timeoutSeconds>86400)throw new DomainError('Invalid onchain budget or execution window.');
  const order:ChainOrder={...draft,id:'chain-'+draft.requestId,title:draft.title.trim(),skill:agent.skill,quote:agent.price,deployment:{...deployment},input,inputHash:await digest(input),status:'awaiting-funding',step:0,createdAt:now,updatedAt:now,output:null,outputHash:null,failure:null,funding:null,settlement:null,policySnapshot:null,events:[]};
  const violation=orderPolicy(state,order,now);if(violation)throw new DomainError(violation);
  orderEvent(order,'Awaiting escrow funding','Input and service quote are frozen. No adapter has executed and no sandbox funds were used.',now);
  return {...state,chainOrders:[order,...state.chainOrders??[]]};
}
export function findOrder(state:Workspace,id:string){const order=state.chainOrders?.find(o=>o.id===id);if(!order)throw new DomainError('Onchain order not found.','NOT_FOUND');return order;}
export const orderCommitment=(o:ChainOrder)=>digest({id:o.id,agentId:o.agentId,skill:o.skill,quote:o.quote,budget:o.budget,buyer:o.buyer,input:o.input,spec:o.spec,deployment:o.deployment,scenario:o.scenario,timeoutSeconds:o.timeoutSeconds});
export async function authorizeOrder(state:Workspace,id:string,ownerId:string,transactionHash:Hex,nonce:string,now=new Date().toISOString()){
  const next=structuredClone(state),o=findOrder(next,id);
  if(o.status!=='awaiting-funding')throw new DomainError('This order has already been activated or cancelled.');
  const expiresAt=new Date(Date.parse(now)+300000).toISOString();
  const message=['AgentOS chain reconciliation v1','Purpose: authorize pre-funded agent execution and verify its escrow.',`Workspace: ${await digest({ownerId})}`,`Order: ${o.id}`,`Commitment: ${await orderCommitment(o)}`,`Buyer: ${o.buyer}`,`Transaction: ${transactionHash}`,`Nonce: ${nonce}`,`Expires: ${expiresAt}`].join('\n');
  o.authorization={nonce,message,expiresAt,transactionHash};return {state:next,authorization:o.authorization};
}
export function activateOrder(state:Workspace,id:string,nonce:string,verified:{evidence:ChainEvidence;deadline:bigint;chainNow:bigint;currentStatus:number},now=new Date().toISOString()):Workspace{
  const {evidence,deadline,chainNow,currentStatus}=verified;
  const next=structuredClone(state),o=findOrder(next,id);
  if(o.funding){if(o.funding.transactionHash!==evidence.transactionHash)throw new DomainError('Order already has a different funding transaction.','CONFLICT');return state;}
  if(o.status!=='awaiting-funding'||o.authorization?.nonce!==nonce||o.authorization.expiresAt<=now)throw new DomainError('Order authorization expired or differs from this request.','CONFLICT');
  const violation=orderPolicy(next,o,now);
  if(evidence.status!=='funded'||![1,3].includes(currentStatus))throw new DomainError('A verified funding receipt is required.');
  const stopped=violation??(currentStatus===3?'Escrow was already refunded.':deadline<=chainNow?'Escrow deadline passed.':null);
  o.funding=evidence;o.chainDeadline=deadline.toString();o.status=stopped?'awaiting-settlement':'queued';o.failure=stopped;o.deadlineAt=new Date(Date.parse(now)+Math.max(0,Math.min(o.timeoutSeconds,Number(deadline-chainNow)))*1000).toISOString();
  orderEvent(o,'Escrow funding confirmed',`Verified ${evidence.transactionHash} before starting any adapter.`,now,'success');return next;
}
export async function advanceOrder(state:Workspace,id:string,expectedStep:number,now=new Date().toISOString()):Promise<Workspace>{
  const next=structuredClone(state),o=findOrder(next,id);
  if(!o.funding||o.step!==expectedStep||!['queued','running'].includes(o.status))return state;
  const violation=orderPolicy(next,o,now);
  if(violation||o.deadlineAt&&o.deadlineAt<=now){o.failure=violation??'Execution deadline passed.';o.status='awaiting-settlement';orderEvent(o,'Execution stopped',o.failure+' Escrow refund remains pending until a verified chain receipt.',now,'warning');return next;}
  o.status='running';
  delete o.lastError;
  if(o.step===0){o.policySnapshot=structuredClone(next.policy);o.step=1;orderEvent(o,'Permissions granted','Current capability, budget and onchain daily allowance checks passed.',now,'success');}
  else if(o.step===1){o.step=2;orderEvent(o,'Escrow secured','The existing funded escrow covers the frozen service quote. Sandbox credits are unchanged.',now,'success');}
  else if(o.step===2){
    try{authorizeOperation(o.skill,'dataset.read');if(o.scenario==='injection')authorizeOperation(o.skill,'wallet.transfer');authorizeOperation(o.skill,'artifact.write');o.output=expectedOutput(o);if(o.scenario==='invalid-delivery')o.output.totalCents=Number(o.output.totalCents)+1;o.outputHash=await digest(o.output);o.step=3;orderEvent(o,'Artifact generated','Server adapter ran after funding confirmation. It has no signing key.',now,'success');}
    catch(error){if(!(error instanceof DomainError))throw error;o.failure=error.message;o.status='awaiting-settlement';orderEvent(o,'Execution blocked',o.failure,now,'error');}
  }else if(o.step===3){if(canonical(o.output)!==canonical(expectedOutput(o)))o.failure='Delivery differs from independent recomputation.';o.step=4;o.status='awaiting-settlement';orderEvent(o,o.failure?'Delivery rejected':'Delivery verified locally','Waiting for an actual onchain payment or refund receipt.',now,o.failure?'error':'success');}
  return next;
}
export function orderArtifact(o:ChainOrder,chainId:Hex){return o.settlementAuthorization?.artifactText??JSON.stringify(o.failure?{taskId:chainId,rejectionReason:o.failure}:{taskId:chainId,totalCents:o.output?.totalCents,transferCount:o.output?.transferCount});}
export async function authorizeSettlement(state:Workspace,id:string,chainId:Hex,now=new Date().toISOString()):Promise<Workspace>{
  const next=structuredClone(state),o=findOrder(next,id);if(o.settlementAuthorization||o.settlement)return state;
  if(o.status!=='awaiting-settlement'||!o.funding)throw new DomainError('Order is not ready for settlement authorization.');
  o.failure??=orderPolicy(next,o,now)??(o.deadlineAt&&o.deadlineAt<=now?'Execution deadline passed.':null);
  o.settlementAuthorization={artifactText:orderArtifact(o,chainId),authorizedAt:now,policyHash:await digest(next.policy)};
  orderEvent(o,'Settlement intent committed','Current authority checked. The immutable report artifact will be reused after network failures.',now);return next;
}
export function finishOrder(state:Workspace,id:string,evidence:ChainEvidence,now=new Date().toISOString()):Workspace{
  const next=structuredClone(state),o=findOrder(next,id);
  if(o.settlement){if(o.settlement.transactionHash!==evidence.transactionHash)throw new DomainError('Conflicting chain settlement.','CONFLICT');return state;}
  if(!o.funding||!['paid','refunded'].includes(evidence.status))throw new DomainError('A mined settlement receipt is required.');
  o.settlement=evidence;o.settledAt=now;o.step=5;o.status=evidence.status==='refunded'?'refunded':o.scenario==='interruption'?'paused':'completed';
  delete o.lastError;
  if(o.status==='completed')o.step=6;orderEvent(o,evidence.status==='paid'?'Onchain service fee paid':'Escrow refunded',`Verified ${evidence.transactionHash}; no sandbox settlement was created.`,now,'success');
  const record={id:[evidence.chainId,evidence.escrow.toLowerCase(),evidence.transactionHash.toLowerCase(),evidence.phase].join(':'),webTaskId:o.id,agentId:o.agentId,deployment:o.deployment,evidence,verifiedAt:now};
  next.chainReceipts=[...(next.chainReceipts??[]).filter(r=>r.id!==record.id),record];return next;
}
