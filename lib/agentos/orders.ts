import type { Address, Hex } from 'viem';
import type { WalletDeployment } from '../../sdk/wallet.ts';
import type { ChainEvidence } from '../../sdk/chain.ts';
import { canonical,deliveryVerification,deliveryArtifact, type DeliverySpec } from '../../cre/workflow/verify.ts';
import { authorizeOperation, digest, DomainError, expectedOutput, normalizeInput, resolveSkillInput } from './engine.ts';
import type { Event, Policy, Scenario, Skill, TaskInput, Workspace } from './types.ts';
import type { ModelDescriptor,ModelPlan } from './model.ts';
import type { AgentIdentity } from './identity.ts';
import { supplierRequest,supplierJobId,verifySupplierDelivery,type SupplierDescriptor,type SupplierDelivery } from './supplier.ts';
import {memoryParent} from './artifact-memory.ts';
import {futureWorkflowSteps} from './workflow-state.ts';
import {vaultAllowance,sessionBinding,type VaultBinding} from './vault.ts';
export type OrderStatus='awaiting-funding'|'funding'|'queued'|'running'|'awaiting-settlement'|'paused'|'completed'|'refunded'|'cancelled';
export type ChainOrder={evidencePendingAck?:boolean;evidenceAckAfter?:string;settlementScan?:import('../../sdk/settlements.ts').SettlementCursor;workflowId?:string;vault?:VaultBinding;vaultSessionId?:string;vaultFunding?:{deadline:string;token:string;leaseUntil:string};executor?:'builtin'|'supplier';supplier?:SupplierDescriptor;supplierDelivery?:SupplierDelivery;supplierLease?:{token:string;expiresAt:string;requestHash:string};supplierAttempts?:number;agentIdentity?:AgentIdentity;id:string;requestId:string;title:string;agentId:string;skill:Skill;quote:number;budget:number;buyer:Address;deployment:WalletDeployment;spec:DeliverySpec;input:TaskInput;inputHash:string;scenario:Scenario;timeoutSeconds:number;status:OrderStatus;step:number;createdAt:string;updatedAt:string;deadlineAt?:string;chainDeadline?:string;settledAt?:string;lastError?:string;planner?:'deterministic'|'llm';model?:ModelDescriptor;modelPlan?:ModelPlan;modelLease?:{token:string;expiresAt:string};output:Record<string,unknown>|null;outputHash:string|null;failure:string|null;funding:ChainEvidence|null;settlement:ChainEvidence|null;policySnapshot:Policy|null;events:Event[];authorization?:{nonce:string;message:string;expiresAt:string;transactionHash:Hex};settlementAuthorization?:{artifactText:string;authorizedAt:string;policyHash:string}};
export type OrderDraft={workflowId?:string;vaultSessionId?:string;executor?:'builtin'|'supplier';supplier?:SupplierDescriptor;agentIdentity?:AgentIdentity;planner?:'deterministic'|'llm';model?:ModelDescriptor;requestId:string;title:string;agentId:string;budget:number;buyer:Address;spec:DeliverySpec;input?:TaskInput;scenario:Scenario;timeoutSeconds:number};
export const pendingOrders=(state:Workspace)=>(state.chainOrders??[]).filter(o=>(o.evidencePendingAck||['funding','queued','running','awaiting-settlement'].includes(o.status)));
/** Public CRE reads finalized blocks; its escrow window must outlive the short execution timeout. */
export const vaultEscrowWindow=(order:Pick<ChainOrder,'deployment'|'timeoutSeconds'>)=>Math.max(order.deployment.mode==='testnet'?3600:30,order.timeoutSeconds);
export function orderEvent(o:ChainOrder,title:string,detail:string,now=new Date().toISOString(),level:Event['level']='info'){
  o.events.push({id:`${o.id}:${o.events.length}`,at:now,title,detail,level,step:o.step});o.updatedAt=now;
}
export function orderPolicy(state:Workspace,order:ChainOrder,now:string){
  if(order.workflowId&&state.workflows?.find(w=>w.id===order.workflowId)?.status==='cancelled')return 'Workflow was cancelled.';
  if(!state.policy.active)return 'Execution permission has been revoked.';
  if(!state.agents.find(a=>a.id===order.agentId)?.enabled)return 'Agent is disabled.';
  if(!state.policy.allowedSkills.includes(order.skill))return 'Skill is outside the current allowlist.';
  if(order.budget>state.policy.maxTaskBudget)return 'Task budget exceeds the current per-task limit.';
  const used=(state.chainOrders??[]).filter(o=>o.id!==order.id&&o.deployment.chainId===order.deployment.chainId&&o.deployment.token.toLowerCase()===order.deployment.token.toLowerCase()&&(o.funding||o.vault&&o.status==='funding')).reduce((sum,o)=>sum+(o.settlement?.status==='paid'?(o.settledAt?.slice(0,10)===now.slice(0,10)?o.quote:0):!o.settlement?o.budget:0),0);
  const future=futureWorkflowSteps(state).filter(({workflow})=>workflow.deployment.chainId===order.deployment.chainId&&workflow.deployment.token.toLowerCase()===order.deployment.token.toLowerCase()).reduce((sum,{step})=>sum+step.budget,0);
  if(used+future+order.budget>state.policy.dailyBudget)return 'Onchain daily allowance, including funded orders, would be exceeded.';
  return null;
}
export async function createOrder(state:Workspace,draft:OrderDraft,deployment:WalletDeployment,now=new Date().toISOString()):Promise<Workspace>{
  const selected=state.agents.find(a=>a.id===draft.agentId);if(!selected)throw new DomainError('Unknown service.');
  const input=resolveSkillInput(state,selected.skill,draft.input),prior=state.chainOrders?.find(o=>o.requestId===draft.requestId);
  const parameters={...draft,input,planner:draft.planner??'deterministic',model:draft.model??null,agentIdentity:draft.agentIdentity??null,executor:draft.executor??'builtin',supplier:draft.supplier??null};
  if(prior){
    const previous={...(prior.workflowId?{workflowId:prior.workflowId}:{}),planner:prior.planner??'deterministic',model:prior.model??null,agentIdentity:prior.agentIdentity??null,executor:prior.executor??'builtin',supplier:prior.supplier??null,...(prior.vaultSessionId?{vaultSessionId:prior.vaultSessionId}:{}),requestId:prior.requestId,title:prior.title,agentId:prior.agentId,budget:prior.budget,buyer:prior.buyer,spec:prior.spec,input:prior.input,scenario:prior.scenario,timeoutSeconds:prior.timeoutSeconds};
    if(canonical(previous)!==canonical(parameters)||canonical(prior.deployment)!==canonical(deployment))throw new DomainError('Request ID was already used with different chain order parameters.','IDEMPOTENCY_CONFLICT');return state;
  }
  if((state.chainOrders?.length??0)+futureWorkflowSteps(state).length>=300)throw new DomainError('This prototype supports up to 300 onchain orders per workspace.');
  const agent=state.agents.find(a=>a.id===draft.agentId);
  if(!agent?.enabled)throw new DomainError('An enabled service is required.');
  if(canonical(draft.spec.verification)!==canonical(deliveryVerification(agent.skill,input)))throw new DomainError('A complete versioned delivery commitment matching the selected skill and input is required.');
  if(!Number.isSafeInteger(draft.budget)||draft.budget<agent.price||draft.budget>1000000||!Number.isSafeInteger(draft.timeoutSeconds)||draft.timeoutSeconds<1||draft.timeoutSeconds>86400)throw new DomainError('Invalid onchain budget or execution window.');
  if(draft.planner==='llm'&&!draft.model)throw new DomainError('A configured model is required for LLM planning.');
  if(draft.executor==='supplier'&&(!draft.supplier||!draft.agentIdentity||!draft.supplier.skills.includes(agent.skill)))throw new DomainError('An authorized identity and supplier skill are required.');
  const vault=draft.vaultSessionId?sessionBinding(vaultAllowance(state,draft.vaultSessionId,draft.buyer,agent.skill,draft.budget,agent.price,now)):undefined;
  const order:ChainOrder={...draft,...(vault?{vault}:{}),executor:draft.executor??'builtin',planner:draft.planner??'deterministic',id:'chain-'+draft.requestId,title:draft.title.trim(),skill:agent.skill,quote:agent.price,deployment:{...deployment},input,inputHash:await digest(input),status:vault?'funding':'awaiting-funding',step:0,createdAt:now,updatedAt:now,output:null,outputHash:null,failure:null,funding:null,settlement:null,policySnapshot:null,events:[]};
  memoryParent(state,order);
  const violation=orderPolicy(state,order,now);if(violation)throw new DomainError(violation);
  orderEvent(order,'Awaiting escrow funding','Input and service quote are frozen. No adapter has executed and no sandbox funds were used.',now);
  return {...state,chainOrders:[order,...state.chainOrders??[]]};
}
export function findOrder(state:Workspace,id:string){const order=state.chainOrders?.find(o=>o.id===id);if(!order)throw new DomainError('Onchain order not found.','NOT_FOUND');return order;}
export function claimVaultFunding(state:Workspace,id:string,token:string,deadline:bigint,now=new Date().toISOString(),recoverExisting=false){
 const current=findOrder(state,id);if(current.funding||current.status!=='funding'||!recoverExisting&&current.vaultFunding&&current.vaultFunding.leaseUntil>now)return state;
 if(!current.vaultSessionId||!current.vault)throw new DomainError('Vault funding requires a bound session.','FORBIDDEN');
 if(!recoverExisting){vaultAllowance(state,current.vaultSessionId,current.buyer,current.skill,current.budget,current.quote,now,id);const violation=orderPolicy(state,current,now);if(violation)throw new DomainError(violation,'FORBIDDEN');}
 const next=structuredClone(state),order=findOrder(next,id);
 order.vaultFunding={deadline:order.vaultFunding?.deadline??deadline.toString(),token,leaseUntil:new Date(Date.parse(now)+90000).toISOString()};
 orderEvent(order,'Vault funding authorized','A bounded session reserved this frozen quote before contacting the executor.',now);return next;
}
export function activateVaultOrder(state:Workspace,id:string,token:string,verified:{evidence:ChainEvidence;deadline:bigint;chainNow:bigint;currentStatus:number},now=new Date().toISOString()){
 const next=structuredClone(state),order=findOrder(next,id);
 if(order.funding){if(order.funding.transactionHash!==verified.evidence.transactionHash)throw new DomainError('Vault funding receipt conflicts.','CONFLICT');return state;}
 if(order.status!=='funding'||order.vaultFunding?.token!==token||!order.vault)throw new DomainError('Vault funding lease changed.','CONFLICT');
 order.authorization={nonce:token,message:'Funding authorized by bounded Vault session '+order.vault.sessionId,expiresAt:new Date(Date.parse(now)+300000).toISOString(),transactionHash:verified.evidence.transactionHash};order.status='awaiting-funding';
 return activateOrder(next,id,token,verified,now);
}
export function claimModelLease(state:Workspace,id:string,token:string,now=new Date().toISOString()):Workspace{
  const next=structuredClone(state),o=findOrder(next,id);
  if(!o.funding||o.planner!=='llm'||o.modelPlan||o.step!==2||o.status!=='running'||o.modelLease&&o.modelLease.expiresAt>now)return state;
  const violation=orderPolicy(next,o,now);if(violation||o.deadlineAt&&o.deadlineAt<=now){o.failure=violation??'Execution deadline passed.';o.status='awaiting-settlement';return next;}
  o.modelLease={token,expiresAt:new Date(Date.parse(now)+65000).toISOString()};orderEvent(o,'Model planning started','A leased model request will select typed operations; it cannot sign transactions.',now);return next;
}
export function commitModelPlan(state:Workspace,id:string,token:string,result:{plan?:ModelPlan;error?:string},now=new Date().toISOString()):Workspace{
  const next=structuredClone(state),o=findOrder(next,id);
  if(o.status!=='running'||o.step!==2||o.modelPlan||o.modelLease?.token!==token||o.modelLease.expiresAt<=now)return state;
  delete o.modelLease;
  const violation=orderPolicy(next,o,now)??(o.deadlineAt&&o.deadlineAt<=now?'Execution deadline passed.':null);
  if(violation||result.error){o.failure=violation??result.error!;o.status='awaiting-settlement';orderEvent(o,'Model execution rejected',o.failure,now,'error');return next;}
  if(!result.plan||canonical(result.plan.descriptor)!==canonical(o.model))throw new DomainError('Model identity differs from the authorized order.','CONFLICT');
  o.modelPlan=result.plan;orderEvent(o,'Model plan received','Model output remains untrusted until every requested operation passes the capability gate.',now,'success');return next;
}
export function authorizeOrderOperations(o:ChainOrder){
  if(o.planner==='llm'){if(!o.modelPlan)throw new DomainError('A model plan is required before execution.','MODEL_REJECTED');for(const operation of o.modelPlan.operations)authorizeOperation(o.skill,operation,o.input.skillDefinition);if(canonical(o.modelPlan.operations)!==canonical(['dataset.read','artifact.write']))throw new DomainError('Model plan must read the dataset before writing one artifact.','MODEL_REJECTED');}
  authorizeOperation(o.skill,'dataset.read',o.input.skillDefinition);if(o.scenario==='injection')authorizeOperation(o.skill,'wallet.transfer',o.input.skillDefinition);authorizeOperation(o.skill,'artifact.write',o.input.skillDefinition);
}
export async function claimSupplierLease(state:Workspace,id:string,token:string,now=new Date().toISOString()):Promise<Workspace>{
  const next=structuredClone(state),o=findOrder(next,id);
  if(!o.funding||o.executor!=='supplier'||o.supplierDelivery||o.step!==2||o.status!=='running'||o.supplierLease&&o.supplierLease.expiresAt>now)return state;
  try{const violation=orderPolicy(next,o,now)??(o.deadlineAt&&o.deadlineAt<=now?'Execution deadline passed.':null);if(violation)throw new DomainError(violation);authorizeOrderOperations(o);}catch(error){if(!(error instanceof DomainError))throw error;o.failure=error.message;o.status='awaiting-settlement';orderEvent(o,'Supplier execution blocked',o.failure,now,'error');return next;}
  const request=await supplierRequest(o);o.supplierLease={token,expiresAt:new Date(Date.parse(now)+65000).toISOString(),requestHash:await digest(request)};o.supplierAttempts=(o.supplierAttempts??0)+1;orderEvent(o,'Supplier execution started','A leased, funded request was committed before sending input to the authorized supplier. Job '+supplierJobId(request),now);return next;
}
export async function commitSupplierDelivery(state:Workspace,id:string,token:string,result:{delivery?:SupplierDelivery;error?:string;retryable?:boolean},now=new Date().toISOString()):Promise<Workspace>{
  const next=structuredClone(state),o=findOrder(next,id),lease=o.supplierLease;
  if(o.status!=='running'||o.step!==2||o.supplierDelivery||lease?.token!==token||lease.expiresAt<=now)return state;
  delete o.supplierLease;
  const violation=orderPolicy(next,o,now)??(o.deadlineAt&&o.deadlineAt<=now?'Execution deadline passed.':null);
  try{if(violation)throw new DomainError(violation);authorizeOrderOperations(o);}catch(error){if(!(error instanceof DomainError))throw error;o.failure=error.message;o.status='awaiting-settlement';orderEvent(o,'Supplier execution blocked',o.failure,now,'error');return next;}
  if(result.error){if(result.retryable){o.lastError=result.error;orderEvent(o,'Supplier awaits recovery',result.error,now,'warning');}else{o.failure=result.error;o.status='awaiting-settlement';orderEvent(o,'Supplier delivery rejected',result.error,now,'error');}return next;}
  const request=await supplierRequest(o),delivery=result.delivery?await verifySupplierDelivery(result.delivery,request):undefined;
  if(!delivery||delivery.payload.requestHash!==lease.requestHash||delivery.payload.requestHash!==await digest(request)||delivery.payload.jobId!==supplierJobId(request)||delivery.payload.configHash!==o.supplier?.configHash)throw new DomainError('Supplier delivery differs from the leased request.','CONFLICT');
  o.supplierDelivery=delivery;
  if(canonical(delivery.payload.output)!==canonical(expectedOutput(o))){o.failure='Supplier result differs from independent recomputation.';o.status='awaiting-settlement';orderEvent(o,'Supplier delivery rejected',o.failure,now,'error');return next;}
  o.output=delivery.payload.output;o.outputHash=await digest(o.output);o.step=3;delete o.lastError;orderEvent(o,'Supplier delivery verified','Supplier signature, input commitment and independent result recomputation passed.',now,'success');return next;
}
export const orderCommitment=(o:ChainOrder)=>digest({id:o.id,agentId:o.agentId,skill:o.skill,quote:o.quote,budget:o.budget,buyer:o.buyer,input:o.input,spec:o.spec,deployment:o.deployment,scenario:o.scenario,timeoutSeconds:o.timeoutSeconds,...(o.vault?{vault:o.vault}:{}),planner:o.planner??'deterministic',model:o.model??null,...(o.agentIdentity?{agentIdentity:o.agentIdentity}:{}),...(o.executor==='supplier'?{executor:'supplier',supplier:o.supplier}:{})});
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
    try{if(o.planner==='llm'&&!o.modelPlan)return state;authorizeOrderOperations(o);if(o.executor==='supplier')return state;o.output=expectedOutput(o);if(o.scenario==='invalid-delivery')o.output.totalCents=Number(o.output.totalCents)+1;o.outputHash=await digest(o.output);o.step=3;orderEvent(o,'Artifact generated','Server adapter ran after funding confirmation. It has no signing key.',now,'success');}
    catch(error){if(!(error instanceof DomainError))throw error;o.failure=error.message;o.status='awaiting-settlement';orderEvent(o,'Execution blocked',o.failure,now,'error');}
  }else if(o.step===3){if(canonical(o.output)!==canonical(expectedOutput(o)))o.failure='Delivery differs from independent recomputation.';o.step=4;o.status='awaiting-settlement';orderEvent(o,o.failure?'Delivery rejected':'Delivery verified locally','Waiting for an actual onchain payment or refund receipt.',now,o.failure?'error':'success');}
  return next;
}
export function orderArtifact(o:ChainOrder,chainId:Hex){return o.settlementAuthorization?.artifactText??JSON.stringify(o.failure?{taskId:chainId,rejectionReason:o.failure}:o.spec.verification?deliveryArtifact(chainId,o.spec.verification,o.spec.datasetHash,o.output):{taskId:chainId,totalCents:o.output?.totalCents,transferCount:o.output?.transferCount});}
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
  o.settlement=evidence;if(o.deployment.mode==='testnet')o.evidencePendingAck=true;o.settledAt=now;o.step=5;o.status=evidence.status==='refunded'?'refunded':o.scenario==='interruption'?'paused':'completed';
  delete o.modelLease;delete o.supplierLease;
  delete o.lastError;
  if(o.status==='completed')o.step=6;orderEvent(o,evidence.status==='paid'?'Onchain service fee paid':'Escrow refunded',`Verified ${evidence.transactionHash}; no sandbox settlement was created.`,now,'success');
  const record={id:[evidence.chainId,evidence.escrow.toLowerCase(),evidence.transactionHash.toLowerCase(),evidence.phase].join(':'),webTaskId:o.id,agentId:o.agentId,deployment:o.deployment,evidence,verifiedAt:now};
  next.chainReceipts=[...(next.chainReceipts??[]).filter(r=>r.id!==record.id),record];return next;
}
