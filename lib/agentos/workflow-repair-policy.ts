import {z} from 'zod';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import type {Workspace} from './types.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {ModelDescriptor} from './model.ts';
import type {WorkflowProposal} from './workflow-plans.ts';

const id=z.string().min(1).max(128),hash=z.string().regex(/^0x[0-9a-f]{64}$/),money=z.number().int().positive().max(1000000);
export const repairPolicyInputSchema=z.object({requestId:z.string().uuid(),workflowId:id,buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),vaultSessionId:z.string().uuid(),goal:z.string().trim().min(3).max(500),goalBudget:money,planBudget:money,perStepBudget:money,maxSteps:z.number().int().min(1).max(8),execution:z.enum(['builtin','supplier','any']),allowConditions:z.boolean().default(false),maxAttempts:z.number().int().min(1).max(3),durationSeconds:z.number().int().min(60).max(86400)}).strict();
export type RepairPolicyInput=z.infer<typeof repairPolicyInputSchema>;
export const automatedProposalSchema=z.object({policyId:id,policyDigest:hash,attempt:z.number().int().min(1).max(3)}).strict();
export type AutomatedProposal=z.infer<typeof automatedProposalSchema>;
export type RepairPolicyStatus='armed'|'waiting'|'running'|'proposed'|'blocked'|'exhausted'|'cancelled'|'expired'|'completed';
export type RepairAttempt={number:number;requestId:string;token:string;leaseUntil:string;startedAt:string};
export type RepairHistory={number:number;requestId:string;startedAt:string;finishedAt:string;outcome:'proposed'|'failed'|'lease-expired'|'cancelled';code?:string;planId?:string};
export type WorkflowRepairPolicy={version:'agentos.workflow-repair-policy.v1';id:string;requestId:string;workspaceHash:string;parameters:RepairPolicyInput;deployment:WalletDeployment;model:ModelDescriptor;createdAt:string;expiresAt:string;digest:string;activeWorkflowId:string;status:RepairPolicyStatus;attempts:number;history:RepairHistory[];lease?:RepairAttempt;notBefore?:string;proposalId?:string;reason?:string};
export const repairPolicyTerms=(p:WorkflowRepairPolicy)=>({version:p.version,id:p.id,requestId:p.requestId,workspaceHash:p.workspaceHash,parameters:p.parameters,deployment:p.deployment,model:p.model,createdAt:p.createdAt,expiresAt:p.expiresAt});
export async function verifyRepairPolicy(p:WorkflowRepairPolicy){
 const parsed=repairPolicyInputSchema.safeParse(p.parameters);if(!parsed.success||canonical(parsed.data)!==canonical(p.parameters)||p.version!=='agentos.workflow-repair-policy.v1'||p.id!=='repair-'+p.requestId||p.requestId!==p.parameters.requestId||await digest(repairPolicyTerms(p))!==p.digest||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.parse(p.createdAt)||Date.parse(p.expiresAt)-Date.parse(p.createdAt)>p.parameters.durationSeconds*1000||!Number.isSafeInteger(p.attempts)||p.attempts<0||p.attempts>p.parameters.maxAttempts)throw new DomainError('Automatic repair policy differs from its approved limits.','FORBIDDEN');
 if(!['armed','waiting','running','proposed','blocked','exhausted','cancelled','expired','completed'].includes(p.status)||p.history.length+(p.lease?1:0)!==p.attempts||new Set(p.history.map(h=>h.number)).size!==p.history.length||p.history.some(h=>h.number<1||h.number>p.attempts)||p.lease&&(p.lease.number!==p.attempts||p.status!=='running'||p.lease.leaseUntil>p.expiresAt))throw new DomainError('Automatic repair attempt history is inconsistent.','FORBIDDEN');
}
export function findRepairPolicy(state:Workspace,id:string){const p=state.workflowRepairPolicies?.find(p=>p.id===id);if(!p)throw new DomainError('Automatic repair policy not found.','NOT_FOUND');return p;}
export const activeRepairStatus=(status:RepairPolicyStatus)=>['armed','waiting','running','proposed','blocked'].includes(status);
export function repairWorkItems(state:Workspace,now=Date.now()){
 return (state.workflowRepairPolicies??[]).filter(p=>{
  if(!['armed','waiting','running'].includes(p.status))return false;const w=state.workflows?.find(w=>w.id===p.activeWorkflowId);return p.status!=='armed'||!w||w.status!=='running'||Boolean(w.supersededBy);
 }).map(p=>({kind:'repair' as const,taskId:p.id,deadline:p.expiresAt,notBefore:Date.parse(p.expiresAt)<=now?0:p.lease?Date.parse(p.lease.leaseUntil):p.notBefore?Date.parse(p.notBefore):0}));
}
export async function createRepairPolicy(state:Workspace,raw:RepairPolicyInput,scope:string,deployment:WalletDeployment,model:ModelDescriptor,now=new Date().toISOString()){
 const parameters=repairPolicyInputSchema.parse(raw),prior=state.workflowRepairPolicies?.find(p=>p.requestId===parameters.requestId);
 if(prior){if(canonical(prior.parameters)!==canonical(parameters)||prior.workspaceHash!==scope||canonical(prior.deployment)!==canonical(deployment))throw new DomainError('Repair policy request ID was used with different terms.','IDEMPOTENCY_CONFLICT');return state;}
 const w=state.workflows?.find(w=>w.id===parameters.workflowId),session=state.vaultSessions?.find(s=>s.sessionId===parameters.vaultSessionId);
 if(!w||!['running','blocked'].includes(w.status)||w.supersededBy||w.buyer.toLowerCase()!==parameters.buyer.toLowerCase()||canonical(w.deployment)!==canonical(deployment))throw new DomainError('Select an unfinished workflow owned by this wallet.','FORBIDDEN');
 if(!state.policy.active||!session?.signature||session.revokedAt||session.scope!==scope||session.owner.toLowerCase()!==parameters.buyer.toLowerCase()||Number(session.expires)*1000<=Date.parse(now)||parameters.perStepBudget>session.perTaskCents||parameters.perStepBudget>state.policy.maxTaskBudget||parameters.planBudget>parameters.goalBudget)throw new DomainError('Automatic repair limits require an active bounded Vault session.','FORBIDDEN');
 if((state.workflowRepairPolicies?.length??0)>=20)throw new DomainError('Workspace repair policy history is full.');
 if(state.workflowRepairPolicies?.some(p=>p.activeWorkflowId===w.id&&activeRepairStatus(p.status)))throw new DomainError('Disable the existing repair policy before changing its limits.','CONFLICT');
 const terms={version:'agentos.workflow-repair-policy.v1' as const,id:'repair-'+parameters.requestId,requestId:parameters.requestId,workspaceHash:scope,parameters,deployment:structuredClone(deployment),model:structuredClone(model),createdAt:now,expiresAt:new Date(Math.min(Date.parse(now)+parameters.durationSeconds*1000,Number(session.expires)*1000)).toISOString()},policy:WorkflowRepairPolicy={...terms,digest:await digest(terms),activeWorkflowId:w.id,status:'armed',attempts:0,history:[]};
 return {...state,workflowRepairPolicies:[policy,...state.workflowRepairPolicies??[]]};
}
export async function setRepairPolicy(state:Workspace,id:string,reviewDigest:string,action:'cancel'|'resume',now=new Date().toISOString()){
 const p=findRepairPolicy(state,id);await verifyRepairPolicy(p);if(p.digest!==reviewDigest)throw new DomainError('Repair policy differs from the reviewed digest.','FORBIDDEN');if(action==='cancel'&&p.status==='cancelled')return state;
 if(action==='resume'&&(!['blocked','waiting'].includes(p.status)||p.attempts>=p.parameters.maxAttempts||p.expiresAt<=now))throw new DomainError('This repair policy cannot resume under its original limits.','FORBIDDEN');
 const next=structuredClone(state),target=findRepairPolicy(next,id);if(target.lease)target.history.push({number:target.lease.number,requestId:target.lease.requestId,startedAt:target.lease.startedAt,finishedAt:now,outcome:'cancelled',code:'owner-cancelled'});delete target.lease;delete target.notBefore;target.status=action==='cancel'?'cancelled':'armed';target.reason=action==='cancel'?'owner-cancelled':undefined;return next;
}
export async function repairAttemptRequestId(policyId:string,number:number){const h=(await digest({policyId,number})).slice(2);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
/** The claim is committed before inference. A replacement lease never restores an attempt. */
export function claimRepairAttempt(state:Workspace,id:string,token:string,requestId:string,leaseMs:number,now=new Date().toISOString()){
 const p=findRepairPolicy(state,id);if(!['armed','waiting'].includes(p.status)||p.lease||p.notBefore&&p.notBefore>now||p.expiresAt<=now||p.attempts>=p.parameters.maxAttempts)return state;
 const next=structuredClone(state),target=findRepairPolicy(next,id);target.attempts++;target.status='running';target.lease={number:target.attempts,token,requestId,startedAt:now,leaseUntil:new Date(Math.min(Date.parse(now)+leaseMs,Date.parse(target.expiresAt))).toISOString()};delete target.notBefore;delete target.reason;return next;
}
export function finishRepairAttempt(state:Workspace,id:string,token:string,outcome:RepairHistory['outcome'],code?:string,planId?:string,now=new Date().toISOString()){
 const p=findRepairPolicy(state,id);if(p.status!=='running'||p.lease?.token!==token)return state;
 const next=structuredClone(state),target=findRepairPolicy(next,id),attempt=target.lease!;target.history.push({number:attempt.number,requestId:attempt.requestId,startedAt:attempt.startedAt,finishedAt:now,outcome,...(code?{code}:{}),...(planId?{planId}:{})});delete target.lease;
 target.status=target.expiresAt<=now?'expired':outcome==='proposed'?'proposed':target.attempts>=target.parameters.maxAttempts?'exhausted':'waiting';target.reason=code;
 if(planId)target.proposalId=planId;if(target.status==='waiting')target.notBefore=new Date(Date.parse(now)+Math.min(60000,1000*2**target.attempts)).toISOString();else delete target.notBefore;return next;
}
/** Revoking automation stops future generation; an existing proposal still needs owner approval. */
export function cancelWorkflowRepairs(state:Workspace,workflowId:string,now=new Date().toISOString()){
 const policies=(state.workflowRepairPolicies??[]).filter(p=>p.activeWorkflowId===workflowId&&activeRepairStatus(p.status));if(!policies.length)return state;let next=state;
 for(const p of policies){next=structuredClone(next);const target=findRepairPolicy(next,p.id);if(target.lease)target.history.push({number:target.lease.number,requestId:target.lease.requestId,startedAt:target.lease.startedAt,finishedAt:now,outcome:'cancelled',code:'source-replaced'});target.status='cancelled';target.reason='source-replaced';delete target.lease;delete target.notBefore;}return next;
}
export async function verifyAutomaticProposal(state:Workspace,p:WorkflowProposal){
 if(!p.automation)return;const a=automatedProposalSchema.parse(p.automation),policy=findRepairPolicy(state,a.policyId);await verifyRepairPolicy(policy);
 if(policy.digest!==a.policyDigest||!p.replan||p.requestId!==await repairAttemptRequestId(policy.id,a.attempt)||!policy.history.some(h=>h.number===a.attempt&&h.requestId===p.requestId&&h.planId===p.id&&h.outcome==='proposed'))throw new DomainError('Automatic proposal has no matching repair attempt.','FORBIDDEN');
}
export function advanceRepairPolicy(state:Workspace,p:WorkflowProposal,workflowId:string,now=new Date().toISOString()){
 const matching=(state.workflowRepairPolicies??[]).filter(x=>x.activeWorkflowId===p.replan?.sourceWorkflowId&&activeRepairStatus(x.status));if(!matching.length)return state;
 let next=structuredClone(state);for(const original of matching){const target=findRepairPolicy(next,original.id);if(p.automation?.policyId===target.id&&target.proposalId===p.id){target.activeWorkflowId=workflowId;target.status=target.expiresAt<=now?'expired':target.attempts>=target.parameters.maxAttempts?'exhausted':'armed';delete target.proposalId;delete target.reason;delete target.notBefore;}else next=cancelWorkflowRepairs(next,target.activeWorkflowId,now);}return next;
}
