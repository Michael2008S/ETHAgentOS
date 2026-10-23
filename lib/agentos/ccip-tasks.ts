import {z} from 'zod';
import {parseAbi,keccak256,stringToHex,type Hex} from 'viem';
import {digest,DomainError,canonical} from './engine.ts';
import type {Workspace} from './types.ts';
import {deliveryVerification,verifyDelivery} from '../../cre/workflow/verify.ts';
export const CCIP_MAX_ACTIVE=10,CCIP_MAX_HISTORY=50;
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(s=>s.toLowerCase() as Hex),hash=z.string().regex(/^0x[0-9a-f]{64}$/);
const chain=z.object({chainId:z.number().int(),selector:z.string(),token:address,escrow:address,vault:address,router:address,lane:address,seller:address}).strict();
export const ccipDeploymentSchema=z.object({version:z.literal('agentos.local-ccip.v1'),a:chain.extend({chainId:z.literal(31338),selector:z.literal('1001')}),b:chain.extend({chainId:z.literal(31339),selector:z.literal('1002')})}).strict();
export type CCIPDeployment=z.infer<typeof ccipDeploymentSchema>;
export const ccipDraftSchema=z.object({requestId:z.string().uuid(),title:z.string().trim().min(1).max(120),budgetCents:z.number().int().min(1).max(300),durationSeconds:z.number().int().min(60).max(3600).default(600),scenario:z.enum(['success','invalid-delivery']).default('success'),approved:z.literal(true),input:z.object({dataset:z.literal('custom-transfers-v1'),blockFrom:z.number().int().nonnegative().safe(),blockTo:z.number().int().nonnegative().safe(),records:z.array(z.object({block:z.number().int().nonnegative().safe(),from:z.string().trim().min(1).max(128),to:z.string().trim().min(1).max(128),cents:z.number().int().nonnegative().safe()}).strict()).min(1).max(25)}).strict()}).strict().refine(d=>d.input.blockFrom<=d.input.blockTo&&d.input.records.every(r=>r.block>=d.input.blockFrom&&r.block<=d.input.blockTo)&&Number.isSafeInteger(d.input.records.reduce((s,r)=>s+r.cents,0)),'Bounded input range and total required.');
export type CCIPDraft=z.infer<typeof ccipDraftSchema>;
export type CCIPTerms={id:string;scope:string;chainTaskId:Hex;draft:CCIPDraft;draftHash:string;expiresAt:string;deployment:CCIPDeployment};
export type CCIPJob=CCIPTerms&{termsHash:Hex;createdAt:string;status:'queued'|'pending'|'cancelling'|'completed'|'refunded'|'cancelled';reservedCents:number;cancelRequested:boolean;nextAttemptAt?:number;lastError?:string;evidence?:CCIPObservation};
export type CCIPObservation={aPhase:number;bPhase:number;escrowStatus:number;accepted:boolean;outputHash:Hex;artifactText?:string;datasetText?:string;blocks:{a:{number:string;hash:string};b:{number:string;hash:string}};aReserved:string;bReserved:string};
export const ccipLaneABI=parseAbi(['function tasks(bytes32) view returns(uint256 amount,uint64 expires,bytes32 spec,uint8 phase,bool revoked,bool accepted,bytes32 output)','function reserved() view returns(uint256)']);
export const ccipTerms=(j:CCIPJob):CCIPTerms=>({id:j.id,scope:j.scope,chainTaskId:j.chainTaskId,draft:j.draft,draftHash:j.draftHash,expiresAt:j.expiresAt,deployment:j.deployment});
export const ccipTerminal=(j:CCIPJob)=>['completed','refunded','cancelled'].includes(j.status);
export function ccipJob(state:Workspace,id:string){const job=state.ccipTasks?.find(j=>j.id===id);if(!job)throw new DomainError('CCIP task not found.','NOT_FOUND');return job;}
export async function verifyCCIPJob(j:CCIPJob){ccipDraftSchema.parse(j.draft);ccipDeploymentSchema.parse(j.deployment);hash.parse(j.termsHash);if(await digest(ccipTerms(j))!==j.termsHash||await digest(j.draft)!==j.draftHash)throw new DomainError('CCIP task terms changed.','CONFLICT');}
export function ccipDelivery(job:CCIPJob,origin:string){const datasetText=canonical(job.draft.input.records),verification=deliveryVerification('treasury-report',job.draft.input);return {datasetText,spec:{datasetUrl:origin+'/inputs/'+job.chainTaskId,datasetHash:keccak256(stringToHex(datasetText)),artifactUrl:origin+'/artifacts/'+job.chainTaskId,verification}};}
export function verifyCCIPOutcome(job:CCIPJob,o:CCIPObservation,origin:string){
 if(o.aPhase!==5||![0,5].includes(o.bPhase))return null;
 if(o.bPhase===0){if(o.accepted||o.escrowStatus!==0)return null;return 'cancelled' as const;}
 if(o.escrowStatus===0){if(o.accepted)return null;return 'cancelled' as const;}
 if(o.escrowStatus===3&&!o.accepted)return 'refunded' as const;
 if(o.escrowStatus!==2||!o.accepted||!o.artifactText)throw new DomainError('CCIP settlement differs from its local Escrow.','CONFLICT');
 const {datasetText,spec}=ccipDelivery(job,origin),verdict=verifyDelivery(datasetText,o.artifactText,job.chainTaskId,spec);
 if(!verdict.accepted||verdict.outputHash!==o.outputHash)throw new DomainError('CCIP delivery failed independent verification.','CONFLICT');return 'completed' as const;
}
export interface CCIPStore {read(owner:string):Promise<{state:Workspace;scope?:string}>;updateWorkspace(owner:string,reduce:(state:Workspace)=>Workspace|Promise<Workspace>):Promise<{state:Workspace}>}
export async function createCCIPTask(store:CCIPStore,owner:string,raw:unknown,configuration:()=>Promise<CCIPDeployment>){
 const draft=ccipDraftSchema.parse(raw),id='ccip-'+draft.requestId,draftHash=await digest(draft),scope=await digest({workspace:owner}),now=new Date().toISOString();let deployment:Promise<CCIPDeployment>|undefined;
 const saved=await store.updateWorkspace(owner,async state=>{const existing=state.ccipTasks?.find(j=>j.id===id);if(existing){if(existing.draftHash!==draftHash)throw new DomainError('CCIP request ID terms differ.','CONFLICT');return state;}
  const jobs=state.ccipTasks??[];if(jobs.length>=CCIP_MAX_HISTORY||jobs.filter(j=>!ccipTerminal(j)).length>=CCIP_MAX_ACTIVE)throw new DomainError('CCIP task capacity reached.','CONFLICT');
  if(!state.policy.active||!state.policy.allowedSkills.includes('treasury-report')||draft.budgetCents>state.policy.maxTaskBudget||jobs.filter(j=>j.createdAt.slice(0,10)===now.slice(0,10)).reduce((n,j)=>n+j.draft.budgetCents,0)+draft.budgetCents>state.policy.dailyBudget)throw new DomainError('CCIP policy or daily budget denied.','FORBIDDEN');
  deployment??=configuration();const terms:CCIPTerms={id,scope,chainTaskId:await digest({scope,id}) as Hex,draft,draftHash,expiresAt:new Date(Date.now()+draft.durationSeconds*1000).toISOString(),deployment:ccipDeploymentSchema.parse(await deployment)};
  const job:CCIPJob={...terms,termsHash:await digest(terms) as Hex,createdAt:now,status:'queued',reservedCents:draft.budgetCents,cancelRequested:false};return {...state,ccipTasks:[...jobs,job]};});return ccipJob(saved.state,id);
}
export interface CCIPTransport {origin:string;step(job:CCIPJob):Promise<CCIPObservation>}
export async function runCCIPTask(store:CCIPStore,owner:string,id:string,transport:()=>Promise<CCIPTransport>){
 let job=ccipJob((await store.read(owner)).state,id);if(ccipTerminal(job))return {status:job.status};await verifyCCIPJob(job);
 try{
  const state=(await store.read(owner)).state;if(!state.policy.active||!state.policy.allowedSkills.includes('treasury-report')||Date.now()>=Date.parse(job.expiresAt))await store.updateWorkspace(owner,s=>{const next=structuredClone(s),j=ccipJob(next,id);j.cancelRequested=true;j.status='cancelling';return next;});
  job=ccipJob((await store.read(owner)).state,id);const runtime=await transport(),evidence=await runtime.step(job),terminal=verifyCCIPOutcome(job,evidence,runtime.origin);
  await store.updateWorkspace(owner,s=>{const current=ccipJob(s,id);if(ccipTerminal(current)||current.evidence&&(current.evidence.aPhase>evidence.aPhase||current.evidence.bPhase>evidence.bPhase))return s;const next=structuredClone(s),j=ccipJob(next,id);j.evidence=evidence;j.status=terminal??(j.cancelRequested?'cancelling':'pending');j.reservedCents=terminal?0:j.draft.budgetCents;j.nextAttemptAt=Date.now()+250;delete j.lastError;return next;});return {status:terminal??'pending'};
 }catch(error){await store.updateWorkspace(owner,s=>{const next=structuredClone(s),j=ccipJob(next,id);if(!ccipTerminal(j)){j.lastError=error instanceof DomainError?error.message:'Local CCIP unavailable; budget and checkpoint retained.';j.nextAttemptAt=Date.now()+1000;}return next;});return {status:'retryable'};}
}
