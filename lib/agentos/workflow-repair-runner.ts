import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {modelDescriptor,type ModelConfiguration} from './model.ts';
import type {Workspace} from './types.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {OrderChain} from './order-chain.ts';
import {assertReplanSnapshot,buildWorkflowReplan,replanCapacityState} from './workflow-replan.ts';
import {generateWorkflowProposal,saveWorkflowProposal,normalizePlanParameters,workflowProposalTerms,type PlanChoice,type PlanParameters} from './workflow-plans.ts';
import {findRepairPolicy,verifyRepairPolicy,claimRepairAttempt,finishRepairAttempt,repairAttemptRequestId,type RepairPolicyStatus,type WorkflowRepairPolicy} from './workflow-repair-policy.ts';
type Store={read(owner:string):Promise<{state:Workspace}>;updateWorkspace(owner:string,reduce:(state:Workspace)=>Workspace|Promise<Workspace>):Promise<{state:Workspace}>};
export type RepairRuntime={scope:string;deployment:WalletDeployment;chain:OrderChain;model:{configuration:ModelConfiguration;key?:string};catalog:(state:Workspace,p:PlanParameters)=>Promise<{choices:PlanChoice[]}>;checkSession:(state:Workspace,p:PlanParameters,gross:number)=>Promise<void>};
function stateOf(state:Workspace,id:string,status:RepairPolicyStatus,reason:string|undefined,now:string,expected:WorkflowRepairPolicy){
 const current=findRepairPolicy(state,id);if(current.status!==expected.status||current.attempts!==expected.attempts||current.activeWorkflowId!==expected.activeWorkflowId||current.lease?.token!==expected.lease?.token||current.notBefore!==expected.notBefore)return state;
 const next=structuredClone(state),p=findRepairPolicy(next,id);if(p.lease)p.history.push({number:p.lease.number,requestId:p.lease.requestId,startedAt:p.lease.startedAt,finishedAt:now,outcome:status==='expired'?'lease-expired':'cancelled',code:reason});p.status=status;p.reason=reason;delete p.lease;if(status==='waiting')p.notBefore=new Date(Date.parse(now)+5000).toISOString();else delete p.notBefore;return next;
}
/** Queue/owner ticks share this runner; the durable policy lease fences external model calls. */
export async function runWorkflowRepair(store:Store,ownerId:string,id:string,runtime:RepairRuntime,options:{now?:()=>string;request?:typeof fetch;leaseMs?:number}={}){
 const now=()=>options.now?.()??new Date().toISOString();let snapshot=await store.read(ownerId),policy=findRepairPolicy(snapshot.state,id);await verifyRepairPolicy(policy);
 if(!['armed','waiting','running'].includes(policy.status))return {policyId:id,status:policy.status};
 if(policy.expiresAt<=now()){await store.updateWorkspace(ownerId,s=>stateOf(s,id,'expired','expired',now(),policy));return {policyId:id,status:'expired'};}
 if(policy.lease){if(policy.lease.leaseUntil>now())return {policyId:id,status:'busy'};await store.updateWorkspace(ownerId,s=>finishRepairAttempt(s,id,policy.lease!.token,'lease-expired','lease-expired',undefined,now()));return {policyId:id,status:'waiting'};}
 if(policy.attempts>=policy.parameters.maxAttempts){await store.updateWorkspace(ownerId,s=>stateOf(s,id,'exhausted','attempt-limit',now(),policy));return {policyId:id,status:'exhausted'};}
 if(policy.notBefore&&policy.notBefore>now())return {policyId:id,status:'waiting'};
 const source=snapshot.state.workflows?.find(w=>w.id===policy.activeWorkflowId);
 if(!source||source.supersededBy||source.status==='cancelled'){await store.updateWorkspace(ownerId,s=>stateOf(s,id,'cancelled','source-stopped',now(),policy));return {policyId:id,status:'cancelled'};}
 if(source.status==='completed'){await store.updateWorkspace(ownerId,s=>stateOf(s,id,'completed',undefined,now(),policy));return {policyId:id,status:'completed'};}
 if(source.status!=='blocked'){await store.updateWorkspace(ownerId,s=>stateOf(s,id,'armed',undefined,now(),policy));return {policyId:id,status:'armed'};}
 if(policy.workspaceHash!==runtime.scope||canonical(policy.deployment)!==canonical(runtime.deployment)||canonical(policy.model)!==canonical(await modelDescriptor(runtime.model.configuration))){await store.updateWorkspace(ownerId,s=>stateOf(s,id,'blocked','configuration-changed',now(),policy));return {policyId:id,status:'blocked'};}
 let context,parameters,catalog;
 try{
  context=await buildWorkflowReplan(snapshot.state,source.id,policy.parameters.buyer,runtime.deployment,runtime.chain,policy.parameters.goalBudget);
  const remaining=Math.min(policy.parameters.planBudget,policy.parameters.goalBudget-context.grossSpent);if(remaining<1)throw new DomainError('No remaining goal allowance.','FORBIDDEN');
  const input={requestId:await repairAttemptRequestId(id,policy.attempts+1),goal:policy.parameters.goal,buyer:policy.parameters.buyer,vaultSessionId:policy.parameters.vaultSessionId,input:source.input,totalBudget:remaining,perStepBudget:policy.parameters.perStepBudget,maxSteps:policy.parameters.maxSteps,execution:policy.parameters.execution,allowConditions:policy.parameters.allowConditions,timeoutSeconds:300};parameters=normalizePlanParameters(input,true);
  catalog=await runtime.catalog(replanCapacityState(snapshot.state,context),parameters);if(!catalog.choices.length)throw new DomainError('No authorized repair service.','FORBIDDEN');await runtime.checkSession(snapshot.state,parameters,0);
 }catch(error){const waiting=!(error instanceof DomainError)||['UNAVAILABLE','CONFLICT'].includes(error.code);await store.updateWorkspace(ownerId,s=>stateOf(s,id,waiting?'waiting':'blocked',waiting?'evidence-unavailable':'authority-or-budget',now(),policy));return {policyId:id,status:waiting?'waiting':'blocked'};}
 const token=crypto.randomUUID(),claimed=await store.updateWorkspace(ownerId,async s=>{const p=findRepairPolicy(s,id);await verifyRepairPolicy(p);if(p.activeWorkflowId!==source.id||p.attempts!==policy.attempts)return s;await assertReplanSnapshot(s,context);return claimRepairAttempt(s,id,token,parameters.requestId,options.leaseMs??runtime.model.configuration.timeoutMs+15000,now());});policy=findRepairPolicy(claimed.state,id);if(policy.lease?.token!==token)return {policyId:id,status:'busy'};
 try{
  const generated=await generateWorkflowProposal(claimed.state,parameters,runtime.scope,runtime.deployment,catalog.choices,runtime.model.configuration,runtime.model.key,options.request,now(),context),automation={policyId:id,policyDigest:policy.digest,attempt:policy.lease.number},terms={...workflowProposalTerms(generated),automation,expiresAt:new Date(Math.min(Date.parse(generated.expiresAt),Date.parse(policy.expiresAt))).toISOString()},proposal={...generated,automation,expiresAt:terms.expiresAt,digest:await digest(terms)};
  const saved=await store.updateWorkspace(ownerId,async s=>{
   const p=findRepairPolicy(s,id);if(p.status!=='running'||p.lease?.token!==token)return s;
   if(p.expiresAt<=now()||p.lease.leaseUntil<=now())return finishRepairAttempt(s,id,token,'lease-expired','lease-expired',undefined,now());
   await runtime.checkSession(s,parameters,proposal.draft.steps.reduce((n,step)=>n+step.budget,0));await assertReplanSnapshot(s,context);const next=await saveWorkflowProposal(s,proposal);return finishRepairAttempt(next,id,token,'proposed',undefined,proposal.id,now());
  });const current=findRepairPolicy(saved.state,id);return {policyId:id,status:current.status,...(current.proposalId?{planId:current.proposalId}:{})};
 }catch(error){const code=error instanceof DomainError&&['FORBIDDEN','CONFLICT'].includes(error.code)?'source-or-authority-changed':'model-unavailable-or-rejected';const saved=await store.updateWorkspace(ownerId,s=>finishRepairAttempt(s,id,token,'failed',code,undefined,now()));return {policyId:id,status:findRepairPolicy(saved.state,id).status};}
}
