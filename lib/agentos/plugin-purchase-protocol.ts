import {z} from 'zod';
import {digest,DomainError} from './engine.ts';
import {boundedJson,type Json,type PluginRuntimeDescriptor} from './plugin-protocol.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {ChainEvidence} from '../../sdk/chain.ts';
import type {VaultBinding} from './vault.ts';
import type {Workspace} from './types.ts';

const hash=z.string().regex(/^0x[0-9a-f]{64}$/),pluginId=z.string().regex(/^plugin:[a-z][a-z0-9.-]{2,62}@[0-9]+\.[0-9]+\.[0-9]+$/),cents=z.number().int().positive().max(1000000);
export const vaultPluginPermissionSchema=z.object({pluginId,manifestHash:hash,runtimeHash:hash,maxPriceCents:cents}).strict();
export type VaultPluginPermission=z.infer<typeof vaultPluginPermissionSchema>;
export function normalizePluginPermissions(raw:VaultPluginPermission[]){
 const values=z.array(vaultPluginPermissionSchema).min(1).max(20).parse(raw);
 if(new Set(values.map(v=>v.pluginId)).size!==values.length)throw new DomainError('Vault plugin permissions must be unique.','FORBIDDEN');
 return [...values].sort((a,b)=>a.pluginId<b.pluginId?-1:a.pluginId>b.pluginId?1:0);
}
const path=z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(p=>!['constructor','prototype','__proto__'].includes(p))).max(8);
export const pluginPurchaseInputSchema=z.discriminatedUnion('from',[
 z.object({from:z.literal('root'),path:path.default([])}).strict(),
 z.object({from:z.literal('step'),step:z.number().int().min(0).max(7),path:path.default([])}).strict(),
]);
export const pluginPurchaseRequestSchema=z.object({requestId:z.string().uuid(),title:z.string().trim().min(1).max(120),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(a=>!/^0x0{40}$/.test(a)),vaultSessionId:z.string().uuid(),input:z.custom<Json>(v=>{try{boundedJson(v);return true;}catch{return false;}},'Invalid bounded JSON input.'),steps:z.array(z.object({pluginId,manifestHash:hash,runtimeHash:hash,maxPriceCents:cents,input:pluginPurchaseInputSchema}).strict()).min(1).max(8),totalBudget:cents,timeoutSeconds:z.number().int().min(60).max(3600).default(600)}).strict().superRefine((v,ctx)=>{
 for(const [i,step] of v.steps.entries())if(step.input.from==='step'&&step.input.step>=i)ctx.addIssue({code:'custom',path:['steps',i,'input'],message:'Plugin input must refer to an earlier paid step.'});
 if(v.steps.reduce((n,s)=>n+s.maxPriceCents,0)>v.totalBudget)ctx.addIssue({code:'custom',path:['totalBudget'],message:'All step ceilings must fit the reviewed total budget.'});
 if(new TextEncoder().encode(JSON.stringify(v)).length>32768)ctx.addIssue({code:'custom',message:'Plugin purchase draft exceeds its byte bound.'});
});
export type PluginPurchaseDraft=z.infer<typeof pluginPurchaseRequestSchema>;
export type PluginPurchaseStep={index:number;requestId:string;jobId:string;pluginId:string;manifestHash:string;runtimeHash:string;grantEpoch:number;priceCents:number;input:PluginPurchaseDraft['steps'][number]['input'];status:'pending'|'funding'|'funded'|'executing'|'paid'|'refunded'|'cancelled';taskId:`0x${string}`;specHash?:`0x${string}`;inputHash?:string;inputValue?:Json;parent?:{step:number;taskId:`0x${string}`;transactionHash:`0x${string}`;executionDigest:string};fundingIntent?:{deadline:string;token:string;until:string};unfundedProof?:{blockNumber:string;blockHash:string;checkedAt:string};funding?:ChainEvidence;settlement?:ChainEvidence;settlementIntent?:{mode:'verify'|'reject';executionDigest?:string};settledAt?:string;outputHash?:string;failure?:string};
export type PluginPurchaseWorkflow={planReview?:import('./service-plans.ts').ServicePlanReview;version:'agentos.plugin-purchase.v1';id:string;requestId:string;scope:string;draftHash:string;termsHash:string;title:string;buyer:`0x${string}`;vaultSessionId:string;deployment:WalletDeployment;runtime:PluginRuntimeDescriptor;vault:VaultBinding;input:Json;totalBudget:number;createdAt:string;deadlineAt:string;updatedAt:string;status:'running'|'cancelling'|'completed'|'cancelled'|'failed';steps:PluginPurchaseStep[];runLease?:{token:string;until:string};stopReason?:'owner-cancelled'|'permission'|'invalid-delivery'|'expired';lastError?:string};
// Compact references retain gross session consumption even after a refund.
// They also make paid/future plugin fees visible to the existing budget path.
export type PluginPurchaseRef={id:string;vaultSessionId:string;deployment:WalletDeployment;status:PluginPurchaseWorkflow['status'];deadlineAt:string;leaseUntil?:string;steps:{jobId?:string;pluginId?:string;manifestHash?:string;runtimeHash?:string;grantEpoch?:number;inputHash?:string;confirmed?:boolean;priceCents:number;status:PluginPurchaseStep['status'];funded:boolean;settledAt?:string}[]};
export function pluginPurchaseRef(flow:PluginPurchaseWorkflow):PluginPurchaseRef{return {id:flow.id,vaultSessionId:flow.vaultSessionId,deployment:flow.deployment,status:flow.status,deadlineAt:flow.deadlineAt,...(flow.runLease?{leaseUntil:flow.runLease.until}:{}),steps:flow.steps.map(s=>({jobId:s.jobId,pluginId:s.pluginId,manifestHash:s.manifestHash,runtimeHash:s.runtimeHash,grantEpoch:s.grantEpoch,...(s.inputHash?{inputHash:s.inputHash}:{}),confirmed:Boolean(s.funding),priceCents:s.priceCents,status:s.status,funded:Boolean(s.funding||s.fundingIntent&&!s.unfundedProof),...(s.settledAt?{settledAt:s.settledAt}:{} )}))};}
export function pluginPurchaseReservations(state:Workspace,now=new Date().toISOString()){
 return (state.pluginPurchases??[]).flatMap(flow=>flow.steps.filter(s=>s.funded||s.status!=='cancelled').map(step=>({deployment:flow.deployment,vaultSessionId:flow.vaultSessionId,quote:step.priceCents,budget:step.status==='paid'||step.status==='refunded'?(step.settledAt?.slice(0,10)===now.slice(0,10)?step.priceCents:0):step.priceCents})));
}
export function selectPluginPurchaseInput(root:Json,reference:PluginPurchaseDraft['steps'][number]['input'],paid:ReadonlyMap<number,Json>):Json{
 let value:Json|undefined=reference.from==='root'?root:paid.get(reference.step);
 if(value===undefined)throw new DomainError('Plugin input requires a verified paid parent.','FORBIDDEN');
 for(const key of reference.path){if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,key))throw new DomainError('Plugin input path is unavailable.','FORBIDDEN');value=value[key];}
 boundedJson(value);return structuredClone(value);
}
export const pluginPurchaseTaskId=(scope:string,requestId:string,step:number)=>digest({protocol:'agentos.plugin-purchase-task.v1',scope,requestId,step}) as Promise<`0x${string}`>;

export function pluginPurchaseTerms(flow:PluginPurchaseWorkflow){return {...(flow.planReview?{planReview:flow.planReview}:{}),version:flow.version,id:flow.id,requestId:flow.requestId,scope:flow.scope,draftHash:flow.draftHash,title:flow.title,buyer:flow.buyer,vaultSessionId:flow.vaultSessionId,deployment:flow.deployment,runtime:flow.runtime,vault:flow.vault,input:flow.input,totalBudget:flow.totalBudget,createdAt:flow.createdAt,deadlineAt:flow.deadlineAt,steps:flow.steps.map(s=>({index:s.index,requestId:s.requestId,jobId:s.jobId,pluginId:s.pluginId,manifestHash:s.manifestHash,runtimeHash:s.runtimeHash,grantEpoch:s.grantEpoch,priceCents:s.priceCents,input:s.input,taskId:s.taskId}))};}
export function pendingPluginPurchaseSlots(state:Workspace){const ids=new Set((state.pluginJobs??[]).map(j=>j.id));return (state.pluginPurchases??[]).flatMap(f=>f.steps).filter(s=>s.jobId&&!ids.has(s.jobId)&&!['paid','refunded','cancelled'].includes(s.status)).length;}
export function pluginStepRequestId(taskId:string){const hex=taskId.slice(2,34);return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);}

export function pluginPurchaseSpec(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep){if(!step.inputHash)throw new DomainError('Plugin purchase has no committed input.','FORBIDDEN');return {version:'agentos.plugin-purchase-spec.v1',policy:'replay-and-reviewed-verifier.v1',workflowTermsHash:flow.termsHash,scope:flow.scope,taskId:step.taskId,index:step.index,jobId:step.jobId,chainId:flow.deployment.chainId,escrow:flow.deployment.escrow,token:flow.deployment.token,payer:flow.vault.vault,seller:flow.deployment.seller,priceCents:step.priceCents,manifestHash:step.manifestHash,runtimeHash:step.runtimeHash,inputHash:step.inputHash,parent:step.parent??null};}

export type PublicPluginPurchase=Omit<PluginPurchaseWorkflow,'runLease'|'steps'> & {steps:(Omit<PluginPurchaseStep,'fundingIntent'> & {fundingIntent?:Omit<NonNullable<PluginPurchaseStep['fundingIntent']>,'token'>})[]};
export function publicPluginPurchase(flow:PluginPurchaseWorkflow):PublicPluginPurchase{const {runLease:_,...value}=flow;return {...value,steps:flow.steps.map(step=>{const {fundingIntent,...publicStep}=step;if(!fundingIntent)return publicStep;const {token:__,...intent}=fundingIntent;return {...publicStep,fundingIntent:intent};})};}
