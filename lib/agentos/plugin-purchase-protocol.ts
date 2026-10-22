import {z} from 'zod';
import {digest,DomainError} from './engine.ts';
import {boundedJson,type Json} from './plugin-protocol.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {ChainEvidence} from '../../sdk/chain.ts';
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
export type PluginPurchaseStep={index:number;requestId:string;jobId:string;pluginId:string;manifestHash:string;runtimeHash:string;grantEpoch:number;priceCents:number;input:PluginPurchaseDraft['steps'][number]['input'];status:'pending'|'funding'|'funded'|'executing'|'paid'|'refunded'|'cancelled';taskId:`0x${string}`;specHash?:`0x${string}`;inputHash?:string;fundingIntent?:{deadline:string;token:string;until:string};funding?:ChainEvidence;settlement?:ChainEvidence;settledAt?:string;outputHash?:string;failure?:string};
export type PluginPurchaseWorkflow={version:'agentos.plugin-purchase.v1';id:string;requestId:string;scope:string;draftHash:string;termsHash:string;title:string;buyer:`0x${string}`;vaultSessionId:string;deployment:WalletDeployment;input:Json;totalBudget:number;createdAt:string;deadlineAt:string;updatedAt:string;status:'running'|'cancelling'|'completed'|'cancelled'|'failed';steps:PluginPurchaseStep[];runLease?:{token:string;until:string};lastError?:string};
// Compact references retain gross session consumption even after a refund.
// They also make paid/future plugin fees visible to the existing budget path.
export type PluginPurchaseRef={id:string;vaultSessionId:string;deployment:WalletDeployment;status:PluginPurchaseWorkflow['status'];deadlineAt:string;leaseUntil?:string;steps:{priceCents:number;status:PluginPurchaseStep['status'];funded:boolean;settledAt?:string}[]};
export function pluginPurchaseRef(flow:PluginPurchaseWorkflow):PluginPurchaseRef{return {id:flow.id,vaultSessionId:flow.vaultSessionId,deployment:flow.deployment,status:flow.status,deadlineAt:flow.deadlineAt,...(flow.runLease?{leaseUntil:flow.runLease.until}:{}),steps:flow.steps.map(s=>({priceCents:s.priceCents,status:s.status,funded:Boolean(s.funding||s.fundingIntent),...(s.settledAt?{settledAt:s.settledAt}:{} )}))};}
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
