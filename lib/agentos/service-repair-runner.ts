import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {modelDescriptor,type ModelConfiguration} from './model.ts';
import {readPluginFlow} from './plugin-paid-memory.ts';
import {buildServiceReplan} from './service-replan.ts';
import {generateServiceProposal,saveServiceProposal,serviceProposalTerms} from './service-plans.ts';
import {serviceRepairPolicy,verifyServiceRepairPolicy,claimServiceRepair,finishServiceRepair,type ServiceRepairPolicy} from './service-repair-policy.ts';
import {repairAttemptRequestId} from './workflow-repair-policy.ts';
import type {RepairStatus} from './repair-control.ts';
import type {PluginDatabase} from './plugin-store.ts';
import type {PluginPurchaseChain} from './plugin-purchase-chain.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {ServiceDescriptor} from './service-catalog.ts';
import type {Workspace} from './types.ts';
type Store={read(owner:string):Promise<{state:Workspace}>;updateWorkspace(owner:string,reduce:(state:Workspace)=>Workspace|Promise<Workspace>):Promise<{state:Workspace}>};
export type ServiceRepairRuntime={scope:string;database:PluginDatabase;deployment:WalletDeployment;runtimeHash:string;chain:PluginPurchaseChain;model:{configuration:ModelConfiguration;key?:string};catalog:(state:Workspace,p:ServiceRepairPolicy)=>Promise<ServiceDescriptor[]>;authority:(state:Workspace,p:ServiceRepairPolicy,gross:number)=>Promise<unknown>};
function status(state:Workspace,id:string,next:RepairStatus,reason:string|undefined,now:string,expected:ServiceRepairPolicy){
 const p=serviceRepairPolicy(state,id);if(p.status!==expected.status||p.attempts!==expected.attempts||p.activeWorkflowId!==expected.activeWorkflowId||p.lease?.token!==expected.lease?.token||p.notBefore!==expected.notBefore)return state;
 const value=structuredClone(p);if(value.lease)value.history.push({number:value.lease.number,requestId:value.lease.requestId,startedAt:value.lease.startedAt,finishedAt:now,outcome:next==='expired'?'lease-expired':'cancelled',code:reason});value.status=next;value.reason=reason;delete value.lease;if(next==='waiting')value.notBefore=new Date(Date.parse(now)+5000).toISOString();else delete value.notBefore;return {...state,serviceRepairPolicies:state.serviceRepairPolicies!.map(p=>p.id===id?value:p)};
}
/** Only queue/explicit owner ticks call this; reads cannot generate or approve. */
export async function runServiceRepair(store:Store,owner:string,id:string,configuration:ServiceRepairRuntime|(()=>Promise<ServiceRepairRuntime>),options:{now?:()=>string;request?:typeof fetch;leaseMs?:number}={}){
 const now=()=>options.now?.()??new Date().toISOString();const snapshot=await store.read(owner);let policy=serviceRepairPolicy(snapshot.state,id);await verifyServiceRepairPolicy(policy);
 if(!['armed','waiting','running'].includes(policy.status))return {status:policy.status};
 if(policy.expiresAt<=now()){await store.updateWorkspace(owner,s=>status(s,id,'expired','expired',now(),policy));return {status:'expired'};}
 if(policy.lease){if(policy.lease.leaseUntil>now())return {status:'busy'};await store.updateWorkspace(owner,s=>finishServiceRepair(s,id,policy.lease!.token,'lease-expired','lease-expired',undefined,now()));return {status:'waiting'};}
 if(policy.notBefore&&policy.notBefore>now())return {status:'waiting'};
 const reference=snapshot.state.pluginPurchases?.find(f=>f.id===policy.activeWorkflowId);
 if(!reference||reference.supersededBy||reference.status==='cancelled'){await store.updateWorkspace(owner,s=>status(s,id,'cancelled','source-stopped',now(),policy));return {status:'cancelled'};}
 if(reference.status==='completed'){await store.updateWorkspace(owner,s=>status(s,id,'completed',undefined,now(),policy));return {status:'completed'};}
 if(reference.status!=='failed'){await store.updateWorkspace(owner,s=>status(s,id,'armed',undefined,now(),policy));return {status:'armed'};}
 if(policy.attempts>=policy.parameters.maxAttempts){await store.updateWorkspace(owner,s=>status(s,id,'exhausted','attempt-limit',now(),policy));return {status:'exhausted'};}
 let runtime:ServiceRepairRuntime;try{runtime=typeof configuration==='function'?await configuration():configuration;}catch{await store.updateWorkspace(owner,s=>status(s,id,'waiting','configuration-unavailable',now(),policy));return {status:'waiting'};}
 const source=await readPluginFlow(runtime.database,owner,policy.activeWorkflowId);
 if(policy.scope!==runtime.scope||canonical(policy.deployment)!==canonical(runtime.deployment)||policy.runtimeHash!==runtime.runtimeHash||canonical(policy.model)!==canonical(await modelDescriptor(runtime.model.configuration))){await store.updateWorkspace(owner,s=>status(s,id,'blocked','configuration-changed',now(),policy));return {status:'blocked'};}
 let context,parameters,catalog;
 try{
  context=await buildServiceReplan(runtime.database,owner,source.id,policy.parameters.buyer,policy.parameters.goalBudget,null,runtime.chain);
  if(policy.parameters.rootMode==='latest-paid'&&context.rootChoices.length){const candidates=context.rootChoices,firstFlow=candidates[0].workflowId,root=candidates.filter(r=>r.workflowId===firstFlow).sort((a,b)=>b.step-a.step)[0];context=await buildServiceReplan(runtime.database,owner,source.id,policy.parameters.buyer,policy.parameters.goalBudget,{workflowId:root.workflowId,step:root.step},runtime.chain);}
  parameters={requestId:await repairAttemptRequestId(id,policy.attempts+1),goal:policy.parameters.goal,input:context.input,totalBudget:Math.min(policy.parameters.planBudget,policy.parameters.goalBudget-context.replan.grossSpent),perStepBudget:policy.parameters.perStepBudget,maxSteps:policy.parameters.maxSteps,timeoutSeconds:policy.parameters.timeoutSeconds};if(parameters.totalBudget<1)throw new DomainError('Repair budget exhausted.','FORBIDDEN');
  catalog=await runtime.catalog(snapshot.state,policy);if(!catalog.length)throw new DomainError('No exact authorized plugin fits repair.','FORBIDDEN');await runtime.authority(snapshot.state,policy,Math.min(...catalog.map(s=>s.priceCents)));
 }catch(error){const wait=!(error instanceof DomainError)||['UNAVAILABLE','CONFLICT'].includes(error.code);await store.updateWorkspace(owner,s=>status(s,id,wait?'waiting':'blocked',wait?'evidence-unavailable':'authority-or-budget',now(),policy));return {status:wait?'waiting':'blocked'};}
 const token=crypto.randomUUID(),claimed=await store.updateWorkspace(owner,async state=>{const p=serviceRepairPolicy(state,id);await verifyServiceRepairPolicy(p);if(p.activeWorkflowId!==source.id||p.attempts!==policy.attempts||!['armed','waiting'].includes(p.status)||p.lease||p.expiresAt<=now())return state;const current=await buildServiceReplan(runtime.database,owner,source.id,p.parameters.buyer,p.parameters.goalBudget,context.replan.root?{workflowId:context.replan.root.workflowId,step:context.replan.root.step}:null,runtime.chain);if(canonical(current.replan)!==canonical(context.replan))throw new DomainError('Plugin repair source changed before inference.','CONFLICT');return claimServiceRepair(state,id,token,parameters.requestId,options.leaseMs??runtime.model.configuration.timeoutMs+15000,now());});policy=serviceRepairPolicy(claimed.state,id);if(policy.lease?.token!==token)return {status:'busy'};
 try{
  const generated=await generateServiceProposal(claimed.state,parameters,runtime.scope,catalog,runtime.model.configuration,runtime.model.key,options.request,now(),context.replan),automation={policyId:id,policyDigest:policy.digest,attempt:policy.lease.number,policyExpiresAt:policy.expiresAt},terms={...serviceProposalTerms(generated),automation,expiresAt:new Date(Math.min(Date.parse(generated.expiresAt),Date.parse(policy.expiresAt))).toISOString()},proposal={...generated,automation,expiresAt:terms.expiresAt,digest:await digest(terms)};
  const saved=await store.updateWorkspace(owner,async state=>{const p=serviceRepairPolicy(state,id);if(p.status!=='running'||p.lease?.token!==token)return state;if(p.expiresAt<=now()||p.lease.leaseUntil<=now())return finishServiceRepair(state,id,token,'lease-expired','lease-expired',undefined,now());
   await runtime.authority(state,p,proposal.draft.steps.reduce((n,s)=>n+s.maxPriceCents,0));const currentCatalog=await runtime.catalog(state,p);if(proposal.program.steps.some(step=>!currentCatalog.some(s=>s.id===step.serviceId&&s.digest===proposal.catalog.find(c=>c.id===step.serviceId)?.digest)))throw new DomainError('Repair service availability changed during inference.','FORBIDDEN');const current=await buildServiceReplan(runtime.database,owner,source.id,p.parameters.buyer,p.parameters.goalBudget,context.replan.root?{workflowId:context.replan.root.workflowId,step:context.replan.root.step}:null,runtime.chain);if(canonical(current.replan)!==canonical(context.replan))throw new DomainError('Repair source changed during inference.','CONFLICT');return finishServiceRepair(await saveServiceProposal(state,proposal,runtime.scope),id,token,'proposed',undefined,proposal.id,now());});const current=serviceRepairPolicy(saved.state,id);return {status:current.status,...(current.proposalId?{planId:current.proposalId}:{})};
 }catch(error){const code=error instanceof DomainError&&['FORBIDDEN','CONFLICT'].includes(error.code)?'source-or-authority-changed':'model-unavailable-or-rejected',saved=await store.updateWorkspace(owner,s=>finishServiceRepair(s,id,token,'failed',code,undefined,now()));return {status:serviceRepairPolicy(saved.state,id).status};}
}
