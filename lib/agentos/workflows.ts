import type {Address} from 'viem';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import {canonical,type DeliverySpec} from '../../cre/workflow/verify.ts';
import {acceptedArtifactInput,verifyAcceptedOrder} from './artifact-memory.ts';
import {digest,DomainError,normalizeInput,resolveSkillInput} from './engine.ts';
import {createOrder,findOrder} from './orders.ts';
import type {OrderChain} from './order-chain.ts';
import type {TaskInput,Workspace} from './types.ts';
import {workflowInput,type AgentWorkflow,type WorkflowStep,type WorkflowStepDraft,type WorkflowCondition} from './workflow-state.ts';
import {workflowDraftSchema} from './workflow-schema.ts';
import {vaultAllowance,assertVaultSeller} from './vault.ts';
import {makeSupplierQuoteRequest,verifySupplierQuote} from './supplier-quote.ts';
import {validateWorkflowCondition} from './workflow-constraints.ts';
import type {WorkflowSupplierAccess} from './workflow-suppliers.ts';

type WorkflowBase={requestId:string;title:string;buyer:Address;vaultSessionId:string;input?:TaskInput;timeoutSeconds:number};
export type WorkflowDraft=WorkflowBase&({agentIds:[string,string];budgets:[number,number];steps?:never;supplierPricing?:never}|{steps:WorkflowStepDraft[];supplierPricing?:'signed-at-execution-under-cap';agentIds?:never;budgets?:never});
export type EvidencePublisher=(bytes:ReturnType<typeof inputEvidence>)=>Promise<DeliverySpec>;
export function findWorkflow(state:Workspace,id:string){const workflow=state.workflows?.find(w=>w.id===id);if(!workflow)throw new DomainError('Workflow not found.','NOT_FOUND');return workflow;}
export const pendingWorkflows=(state:Workspace)=>(state.workflows??[]).filter(w=>w.status==='running');
const requestFields=(w:AgentWorkflow)=>({requestId:w.requestId,title:w.title,buyer:w.buyer,vaultSessionId:w.vaultSessionId,...(w.version==='agentos.workflow.v1'?{agentIds:w.steps.map(s=>s.agentId),budgets:w.steps.map(s=>s.budget)}:{steps:w.steps.map(s=>({agentId:s.agentId,budget:s.budget,input:s.input,...(s.supplierId?{supplierId:s.supplierId}:{}),...(s.when?{when:s.when}:{})}))}),...(w.version==='agentos.workflow.v3'?{supplierPricing:'signed-at-execution-under-cap'}:{}),input:w.input,timeoutSeconds:w.timeoutSeconds});
async function stepRequestId(requestId:string,index:number){const hex=(await digest({requestId,index})).slice(2);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;}
async function addStepOrder(state:Workspace,w:AgentWorkflow,index:number,input:TaskInput,publish:EvidencePublisher,now:string,supplierAccess?:WorkflowSupplierAccess){
 const step=w.steps[index],agent=state.agents.find(a=>a.id===step.agentId);
 if(!agent?.enabled||agent.skill!==step.skill||!step.supplierId&&agent.price!==step.quote)throw new DomainError('Workflow service or frozen quote changed. Restore it or cancel this workflow.','FORBIDDEN');
 let signedQuote;
 if(step.supplierId){
  const binding=step.supplierBinding;
  if(w.version!=='agentos.workflow.v3'||!binding||!supplierAccess||supplierAccess.scope!==w.workspaceHash||binding.supplier.id!==step.supplierId||binding.identity.agentId!==step.agentId)throw new DomainError('Frozen workflow supplier is unavailable.','SUPPLIER_REJECTED');
  const session=state.vaultSessions?.find(s=>s.sessionId===w.vaultSessionId);if(!session)throw new DomainError('Workflow Vault session is unavailable.','FORBIDDEN');
  assertVaultSeller(session,binding.identity.wallet);await supplierAccess.authorize(binding);
  await supplierAccess.checkSession(session,step.quote+w.steps.filter((s,i)=>i!==index&&!s.orderId&&!s.skippedAt).reduce((sum,s)=>sum+s.quote,0));
  const expected=await makeSupplierQuoteRequest({requestId:step.requestId,workspaceHash:w.workspaceHash!,buyer:w.buyer,payer:session.vault,agentId:step.agentId,skill:step.skill,input:resolveSkillInput(state,step.skill,input),identity:binding.identity,deployment:w.deployment,supplier:binding.supplier});
  signedQuote=await verifySupplierQuote(await supplierAccess.quote(binding,expected),expected,binding.supplier,await supplierAccess.chainTime());
  if(signedQuote.payload.priceCents>step.budget)throw new DomainError('Signed supplier price exceeds the approved workflow step ceiling.','FORBIDDEN');
 }
 const resolved=resolveSkillInput(state,step.skill,input),bytes=inputEvidence({id:'chain-'+step.requestId,skill:step.skill,input:resolved},w.buyer),spec=await publish(bytes);
 if(spec.datasetHash!==bytes.datasetHash||canonical(spec.verification)!==canonical(bytes.verification))throw new DomainError('Workflow evidence publication differs from its frozen input.','CONFLICT');
 return createOrder(state,{workflowId:w.id,requestId:step.requestId,title:w.title+' · '+(w.version==='agentos.workflow.v1'?(index===0?'1. Allocation report':'2. Accepted allocation summary'):`${index+1}. ${step.skill}`),buyer:w.buyer,agentId:step.agentId,budget:step.budget,vaultSessionId:w.vaultSessionId,input:resolved,...(signedQuote?{executor:'supplier' as const,supplier:step.supplierBinding!.supplier,agentIdentity:step.supplierBinding!.identity,supplierQuote:signedQuote}:{}),spec,scenario:'success',timeoutSeconds:w.timeoutSeconds},w.deployment,now,signedQuote?{now:await supplierAccess!.chainTime(),workspaceHash:w.workspaceHash}:{});
}
export async function createWorkflow(state:Workspace,raw:WorkflowDraft,deployment:WalletDeployment,publish:EvidencePublisher,now=new Date().toISOString(),supplierAccess?:WorkflowSupplierAccess){
 const parsed=workflowDraftSchema.safeParse(raw);if(!parsed.success)throw new DomainError('Invalid workflow definition.');
 const draft=parsed.data as WorkflowDraft,input=normalizeInput(draft.input),parameters={...draft,input},prior=state.workflows?.find(w=>w.requestId===draft.requestId);
 if(prior){if(prior.version==='agentos.workflow.v3'&&prior.workspaceHash!==supplierAccess?.scope)throw new DomainError('Workflow workspace differs from its approved supplier scope.','FORBIDDEN');if(canonical(requestFields(prior))!==canonical(parameters)||canonical(prior.deployment)!==canonical(deployment))throw new DomainError('Workflow request ID was already used with different parameters.','IDEMPOTENCY_CONFLICT');return state;}
 if((state.workflows?.length??0)>=100)throw new DomainError('Workspace workflow limit reached.');
 const session=state.vaultSessions?.find(s=>s.sessionId===draft.vaultSessionId);
 if(!session?.signature||session.revokedAt||session.owner.toLowerCase()!==draft.buyer.toLowerCase())throw new DomainError('An active owner Vault session is required.','FORBIDDEN');
 if(!state.policy.active)throw new DomainError('Execution permission has been revoked.','FORBIDDEN');
 const legacy=!draft.steps,definitions:WorkflowStepDraft[]=draft.steps??draft.agentIds.map((agentId,index)=>({agentId,budget:draft.budgets[index],input:index===0?{from:'original'}:{from:'step',step:0}}));
 const supplierMode=definitions.some(s=>s.supplierId);
 if(supplierMode&&(!supplierAccess||!draft.steps||draft.supplierPricing!=='signed-at-execution-under-cap'))throw new DomainError('Supplier workflows require explicit signed-at-execution price ceilings.','FORBIDDEN');
 if(!supplierMode&&draft.steps&&draft.supplierPricing)throw new DomainError('Supplier pricing requires a supplier step.');
 const steps=await Promise.all(definitions.map(async(definition,index)=>{
  const {agentId,budget}=definition,agent=state.agents.find(a=>a.id===agentId);
  if(!agent?.enabled||legacy&&agent.skill!==(index===0?'treasury-report':'event-analysis')||!state.policy.allowedSkills.includes(agent.skill)||!session.skills.includes(agent.skill)||(!definition.supplierId&&budget<agent.price)||budget>session.perTaskCents||budget>state.policy.maxTaskBudget)throw new DomainError(legacy?'Workflow needs an authorized treasury service followed by an event service within each budget.':'Every workflow service requires an installed skill, policy and Vault authorization within its budget.','FORBIDDEN');
  resolveSkillInput(state,agent.skill,input);
  if(definition.input.from==='step'&&definition.input.step>=index)throw new DomainError('Workflow input must reference an earlier step.');
  if(definition.when)validateWorkflowCondition(definition.when,definitions.map(s=>state.agents.find(a=>a.id===s.agentId)?.skill),index);
  let supplierBinding;
  if(definition.supplierId){supplierBinding=await supplierAccess!.bind(state,agentId,definition.supplierId);if(supplierBinding.supplier.id!==definition.supplierId||supplierBinding.identity.agentId!==agentId||!supplierBinding.supplier.skills.includes(agent.skill))throw new DomainError('Workflow supplier does not support the selected registered service.','SUPPLIER_REJECTED');assertVaultSeller(session,supplierBinding.identity.wallet);await supplierAccess!.authorize(supplierBinding);}
  return {requestId:await stepRequestId(draft.requestId,index),agentId,skill:agent.skill,quote:definition.supplierId?budget:agent.price,budget,...(definition.supplierId?{supplierId:definition.supplierId,supplierBinding}:{}),...(!legacy?{input:definition.input,...(definition.when?{when:definition.when}:{})}:{})} as WorkflowStep;
 }));
 if(supplierMode){const gross=steps.reduce((sum,s)=>sum+s.quote,0);vaultAllowance(state,draft.vaultSessionId,draft.buyer,steps[0].skill,steps[0].budget,gross,now);await supplierAccess!.checkSession(session,gross);}
 const workflow:AgentWorkflow={...(supplierMode?{workspaceHash:supplierAccess!.scope}:{}),version:supplierMode?'agentos.workflow.v3':legacy?'agentos.workflow.v1':'agentos.workflow.v2',id:'workflow-'+draft.requestId,requestId:draft.requestId,title:draft.title,buyer:draft.buyer,deployment:{...deployment},vaultSessionId:draft.vaultSessionId,input,timeoutSeconds:draft.timeoutSeconds,totalBudget:steps.reduce((sum,s)=>sum+s.budget,0),status:'running',steps,createdAt:now,updatedAt:now};
 steps[0].orderId='chain-'+steps[0].requestId;
 return addStepOrder({...state,workflows:[workflow,...state.workflows??[]]},workflow,0,input,publish,now,supplierAccess);
}
function matches(output:Record<string,unknown>,when:WorkflowCondition){
 const value=Object.hasOwn(output,when.field)?output[when.field]:undefined;
 if(typeof value!==typeof when.value||typeof value==='number'&&!Number.isSafeInteger(value))throw new DomainError('Accepted output does not support the workflow condition.','FORBIDDEN');
 return when.operator==='eq'?value===when.value:when.operator==='gte'?Number(value)>=Number(when.value):Number(value)<=Number(when.value);
}
export async function advanceWorkflow(state:Workspace,id:string,chain:OrderChain,publish:EvidencePublisher,now=new Date().toISOString(),supplierAccess?:WorkflowSupplierAccess):Promise<Workspace>{
 const original=findWorkflow(state,id);if(original.status!=='running')return state;
 const next=structuredClone(state),w=findWorkflow(next,id);
 try{
  for(let index=0;index<w.steps.length;index++){
   const step=w.steps[index];if(step.skippedAt)continue;
   if(step.orderId){
    const order=findOrder(next,step.orderId);
    if(['refunded','cancelled'].includes(order.status))throw new DomainError('A workflow step did not produce a paid accepted artifact.','FORBIDDEN');
    if(order.status!=='completed'||order.settlement?.status!=='paid')return next;
    // Verify the complete result and every canonical payment before making dependent decisions.
    await verifyAcceptedOrder(next,order,chain);
    continue;
   }
   const source=workflowInput(step,index),dependencies=[...(source.from==='step'?[source.step]:[]),...(step.when?[step.when.step]:[])];
   if(dependencies.some(i=>w.steps[i].skippedAt)){
    step.skippedAt=now;step.skipReason='An input or condition dependency was skipped.';w.updatedAt=now;continue;
   }
   if(step.when&&!matches(findOrder(next,w.steps[step.when.step].orderId!).output!,step.when)){
    step.skippedAt=now;step.skipReason='The accepted output did not match the condition.';w.updatedAt=now;continue;
   }
   const input=source.from==='original'?w.input:acceptedArtifactInput(findOrder(next,w.steps[source.step].orderId!));
   step.orderId='chain-'+step.requestId;w.updatedAt=now;
   return await addStepOrder(next,w,index,input,publish,now,supplierAccess);
  }
  w.status='completed';w.updatedAt=now;delete w.lastError;return next;
 }catch(error){
  if(!(error instanceof DomainError)||!['FORBIDDEN','INVALID_COMMAND','CONFLICT','SUPPLIER_REJECTED'].includes(error.code))throw error;
  const blocked=structuredClone(state),workflow=findWorkflow(blocked,id);workflow.status='blocked';workflow.lastError=error.message;workflow.updatedAt=now;return blocked;
 }
}
export function controlWorkflow(state:Workspace,id:string,action:'resume'|'cancel',now=new Date().toISOString()){
 const next=structuredClone(state),w=findWorkflow(next,id);if(w.status==='completed'||w.status==='cancelled')return state;
 if(action==='resume'){if(w.status!=='blocked')return state;if(w.steps.some(s=>s.orderId&&['refunded','cancelled'].includes(findOrder(next,s.orderId).status)))throw new DomainError('A terminal failed step requires a new workflow.');w.status='running';delete w.lastError;}
 else{w.status='cancelled';delete w.lastError;for(const step of w.steps){if(!step.orderId)continue;const o=findOrder(next,step.orderId);if(o.settlement||o.settlementAuthorization)continue;if(!o.funding&&!o.vaultFunding)o.status='cancelled';else if(o.funding){o.failure='Workflow was cancelled.';o.status='awaiting-settlement';}}}
 w.updatedAt=now;return next;
}
