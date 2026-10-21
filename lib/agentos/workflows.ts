import type {Address} from 'viem';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import {canonical,type DeliverySpec} from '../../cre/workflow/verify.ts';
import {acceptedArtifactInput,verifyMemoryAuthority} from './artifact-memory.ts';
import {digest,DomainError,normalizeInput} from './engine.ts';
import {createOrder,findOrder} from './orders.ts';
import type {OrderChain} from './order-chain.ts';
import type {TaskInput,Workspace} from './types.ts';
import type {AgentWorkflow,WorkflowStep} from './workflow-state.ts';

export type WorkflowDraft={requestId:string;title:string;buyer:Address;vaultSessionId:string;agentIds:[string,string];budgets:[number,number];input?:TaskInput;timeoutSeconds:number};
export type EvidencePublisher=(bytes:ReturnType<typeof inputEvidence>)=>Promise<DeliverySpec>;
export function findWorkflow(state:Workspace,id:string){const workflow=state.workflows?.find(w=>w.id===id);if(!workflow)throw new DomainError('Workflow not found.','NOT_FOUND');return workflow;}
export const pendingWorkflows=(state:Workspace)=>(state.workflows??[]).filter(w=>w.status==='running');
const requestFields=(w:AgentWorkflow)=>({requestId:w.requestId,title:w.title,buyer:w.buyer,vaultSessionId:w.vaultSessionId,agentIds:w.steps.map(s=>s.agentId),budgets:w.steps.map(s=>s.budget),input:w.input,timeoutSeconds:w.timeoutSeconds});
async function stepRequestId(requestId:string,index:number){const hex=(await digest({requestId,index})).slice(2);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;}
async function addStepOrder(state:Workspace,w:AgentWorkflow,index:0|1,input:TaskInput,publish:EvidencePublisher,now:string){
 const step=w.steps[index],agent=state.agents.find(a=>a.id===step.agentId);
 if(!agent?.enabled||agent.skill!==step.skill||agent.price!==step.quote)throw new DomainError('Workflow service or frozen quote changed. Restore it or cancel this workflow.','FORBIDDEN');
 const bytes=inputEvidence({id:'chain-'+step.requestId,skill:step.skill,input},w.buyer),spec=await publish(bytes);
 if(spec.datasetHash!==bytes.datasetHash||canonical(spec.verification)!==canonical(bytes.verification))throw new DomainError('Workflow evidence publication differs from its frozen input.','CONFLICT');
 return createOrder(state,{workflowId:w.id,requestId:step.requestId,title:w.title+' · '+(index===0?'1. Allocation report':'2. Accepted allocation summary'),buyer:w.buyer,agentId:step.agentId,budget:step.budget,vaultSessionId:w.vaultSessionId,input,spec,scenario:'success',timeoutSeconds:w.timeoutSeconds},w.deployment,now);
}
export async function createWorkflow(state:Workspace,draft:WorkflowDraft,deployment:WalletDeployment,publish:EvidencePublisher,now=new Date().toISOString()){
 const input=normalizeInput(draft.input),parameters={...draft,title:draft.title.trim(),input},prior=state.workflows?.find(w=>w.requestId===draft.requestId);
 if(prior){if(canonical(requestFields(prior))!==canonical(parameters)||canonical(prior.deployment)!==canonical(deployment))throw new DomainError('Workflow request ID was already used with different parameters.','IDEMPOTENCY_CONFLICT');return state;}
 if(input.memory||!parameters.title||parameters.title.length>120||!Number.isSafeInteger(draft.timeoutSeconds)||draft.timeoutSeconds<30||draft.timeoutSeconds>86400||(state.workflows?.length??0)>=100)throw new DomainError('Invalid workflow or workspace workflow limit reached.');
 const session=state.vaultSessions?.find(s=>s.sessionId===draft.vaultSessionId);
 if(!session?.signature||session.revokedAt||session.owner.toLowerCase()!==draft.buyer.toLowerCase())throw new DomainError('An active owner Vault session is required.','FORBIDDEN');
 const steps=await Promise.all(draft.agentIds.map(async(agentId,index)=>{
  const agent=state.agents.find(a=>a.id===agentId),skill=index===0?'treasury-report':'event-analysis',budget=draft.budgets[index];
  if(!agent?.enabled||agent.skill!==skill||!state.policy.allowedSkills.includes(skill)||!session.skills.includes(skill)||!Number.isSafeInteger(budget)||budget<agent.price||budget>session.perTaskCents||budget>state.policy.maxTaskBudget)throw new DomainError('Workflow needs an authorized treasury service followed by an event service within each budget.','FORBIDDEN');
  return {requestId:await stepRequestId(draft.requestId,index),agentId,skill,quote:agent.price,budget} as WorkflowStep;
 })) as [WorkflowStep,WorkflowStep];
 const workflow:AgentWorkflow={version:'agentos.workflow.v1',id:'workflow-'+draft.requestId,requestId:draft.requestId,title:parameters.title,buyer:draft.buyer,deployment:{...deployment},vaultSessionId:draft.vaultSessionId,input,timeoutSeconds:draft.timeoutSeconds,totalBudget:steps.reduce((sum,s)=>sum+s.budget,0),status:'running',steps,createdAt:now,updatedAt:now};
 steps[0].orderId='chain-'+steps[0].requestId;
 const next={...state,workflows:[workflow,...state.workflows??[]]};
 return addStepOrder(next,workflow,0,input,publish,now);
}
export async function advanceWorkflow(state:Workspace,id:string,chain:OrderChain,publish:EvidencePublisher,now=new Date().toISOString()):Promise<Workspace>{
 const original=findWorkflow(state,id);if(original.status!=='running')return state;
 const next=structuredClone(state),w=findWorkflow(next,id);
 const first=findOrder(next,w.steps[0].orderId!),second=w.steps[1].orderId?findOrder(next,w.steps[1].orderId):undefined;
 if([first,second].some(o=>o&&['refunded','cancelled'].includes(o.status))){w.status='blocked';w.lastError='A workflow step did not produce a paid accepted artifact.';w.updatedAt=now;return next;}
 if(second){if(second.status==='completed'&&second.settlement?.status==='paid'){await verifyMemoryAuthority(next,second,chain);await chain.settlement(second,second.settlement.transactionHash);w.status='completed';w.updatedAt=now;delete w.lastError;return next;}return state;}
 if(first.status!=='completed'||first.settlement?.status!=='paid')return state;
 try{
  const input=acceptedArtifactInput(first);await verifyMemoryAuthority(next,{input,buyer:w.buyer,deployment:w.deployment},chain);
  // Transfer the future reservation to its order in the same workspace CAS.
  w.steps[1].orderId='chain-'+w.steps[1].requestId;w.updatedAt=now;
  return await addStepOrder(next,w,1,input,publish,now);
 }catch(error){
  if(!(error instanceof DomainError)||!['FORBIDDEN','INVALID_COMMAND','CONFLICT'].includes(error.code))throw error;
  const blocked=structuredClone(state),workflow=findWorkflow(blocked,id);workflow.status='blocked';workflow.lastError=error.message;workflow.updatedAt=now;return blocked;
 }
}
export function controlWorkflow(state:Workspace,id:string,action:'resume'|'cancel',now=new Date().toISOString()){
 const next=structuredClone(state),w=findWorkflow(next,id);if(w.status==='completed'||w.status==='cancelled')return state;
 if(action==='resume'){if(w.status!=='blocked')return state;if(w.steps.some(s=>s.orderId&&['refunded','cancelled'].includes(findOrder(next,s.orderId).status)))throw new DomainError('A terminal failed step requires a new workflow.');w.status='running';delete w.lastError;}
 else{w.status='cancelled';delete w.lastError;for(const step of w.steps){if(!step.orderId)continue;const o=findOrder(next,step.orderId);if(o.settlement||o.settlementAuthorization)continue;if(!o.funding&&!o.vaultFunding)o.status='cancelled';else if(o.funding){o.failure='Workflow was cancelled.';o.status='awaiting-settlement';}}}
 w.updatedAt=now;return next;
}
