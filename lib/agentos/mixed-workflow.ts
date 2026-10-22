import {z} from 'zod';
import {digest,DomainError,normalizeInput} from './engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {boundedJson,validatePluginValue,type Json,type PluginSchema} from './plugin-protocol.ts';
import {schemaAtPath,schemaAssignable,verifyService,type ServiceDescriptor} from './service-catalog.ts';
import type {Workspace,Skill,TaskInput} from './types.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {WorkflowSupplierBinding} from './workflow-suppliers.ts';

const hash=z.string().regex(/^0x[0-9a-f]{64}$/),cents=z.number().int().positive().max(1000000);
const path=z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(k=>!['constructor','prototype','__proto__'].includes(k))).max(8);
export const mixedInputSchema=z.object({from:z.enum(['root','step']),step:z.number().int().min(0).max(7).optional(),adapter:z.enum(['json.v1','transfers.v1','business-summary.v1','business-transfers.v1']),path:path.default([])}).strict();
export const mixedWorkflowDraftSchema=z.object({requestId:z.string().uuid(),title:z.string().trim().min(1).max(120),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),vaultSessionId:z.string().uuid(),input:z.custom<Json>(v=>{try{boundedJson(v,32768);return true;}catch{return false;}},'Invalid mixed workflow JSON.'),steps:z.array(z.object({serviceId:z.string().min(1).max(200),serviceDigest:hash,maxPriceCents:cents,input:mixedInputSchema}).strict()).min(2).max(8),totalBudget:cents,timeoutSeconds:z.number().int().min(120).max(3600).default(600)}).strict();
export type MixedWorkflowDraft=z.infer<typeof mixedWorkflowDraftSchema>;
export type MixedStep={requestId:string;service:ServiceDescriptor;maxPriceCents:number;quote:number;input:z.infer<typeof mixedInputSchema>;grantEpoch?:number;supplierBinding?:WorkflowSupplierBinding;childId?:string;status:'pending'|'active'|'paid'|'cancelled'|'failed';inputHash?:string;parent?:{kind:'order'|'plugin';id:string;step?:number;payment:string;artifactHash:string};outputHash?:string;payment?:string};
export type MixedWorkflow={version:'agentos.mixed-workflow.v1';id:string;scope:string;requestId:string;draftHash:string;termsHash:string;title:string;buyer:`0x${string}`;vaultSessionId:string;deployment:WalletDeployment;input:Json;totalBudget:number;timeoutSeconds:number;createdAt:string;deadlineAt:string;status:'running'|'cancelling'|'completed'|'cancelled'|'failed';steps:MixedStep[];lease?:{token:string;until:string};lastError?:string;updatedAt:string};
export const mixedTerms=(f:MixedWorkflow)=>({version:f.version,id:f.id,scope:f.scope,requestId:f.requestId,draftHash:f.draftHash,title:f.title,buyer:f.buyer,vaultSessionId:f.vaultSessionId,deployment:f.deployment,input:f.input,totalBudget:f.totalBudget,timeoutSeconds:f.timeoutSeconds,createdAt:f.createdAt,deadlineAt:f.deadlineAt,steps:f.steps.map(s=>({requestId:s.requestId,service:s.service,maxPriceCents:s.maxPriceCents,quote:s.quote,input:s.input,...(s.grantEpoch===undefined?{}:{grantEpoch:s.grantEpoch}),...(s.supplierBinding?{supplierBinding:s.supplierBinding}:{})}))});
export function findMixed(state:Workspace,id:string){const f=state.mixedWorkflows?.find(f=>f.id===id);if(!f)throw new DomainError('Mixed workflow not found.','NOT_FOUND');return f;}
export async function verifyMixed(f:MixedWorkflow){if(await digest(mixedTerms(f))!==f.termsHash)throw new DomainError('Mixed workflow terms changed.','CONFLICT');}
export function publicMixed(f:MixedWorkflow){const {lease:_,...value}=f;return value;}
export const pendingMixed=(state:Workspace)=>(state.mixedWorkflows??[]).filter(f=>f.status==='running'||f.status==='cancelling');
export const mixedDrivesPlugin=(state:Workspace,id:string)=>pendingMixed(state).some(f=>f.steps.some(s=>s.childId===id));
export const futureMixed=(state:Workspace)=>pendingMixed(state).flatMap(flow=>flow.steps.filter(step=>step.status==='pending'&&!step.childId).map(step=>({flow,step})));
export const mixedReservations=(state:Workspace)=>futureMixed(state).map(({flow,step})=>({deployment:flow.deployment,vaultSessionId:flow.vaultSessionId,quote:step.quote,budget:step.maxPriceCents}));
export const mixedPluginRuns=(state:Workspace,id?:string)=>futureMixed(state).filter(({step})=>step.service.executor==='plugin'&&(!id||step.service.binding.pluginId===id)).length;
export async function mixedStepUUID(requestId:string,index:number){const h=(await digest({protocol:'agentos.mixed-step.v1',requestId,index})).slice(2,34);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20);}
/** Handoff is committed atomically WITH the child. No reservation is released
 * in an earlier workspace revision, even after response loss or CAS retry. */
export function handoffMixed(state:Workspace,reference:{id:string;index:number;token:string;parent?:MixedStep['parent']},childId:string,inputHash:string,parent=reference.parent){
 const next=structuredClone(state),flow=findMixed(next,reference.id),step=flow.steps[reference.index];
 if(flow.status!=='running'||flow.lease?.token!==reference.token||flow.lease.until<=new Date().toISOString()||!step||step.status!=='pending'&&step.childId!==childId)throw new DomainError('Mixed workflow handoff lease changed.','CONFLICT');
 if(step.childId&&step.childId!==childId||step.inputHash&&step.inputHash!==inputHash)throw new DomainError('Mixed workflow child commitment changed.','CONFLICT');
 const expected=(step.service.executor==='plugin'?'plugin-purchase-':'chain-')+step.requestId;if(childId!==expected)throw new DomainError('Mixed child identifier differs.','FORBIDDEN');if(step.parent&&canonical(step.parent)!==canonical(parent))throw new DomainError('Mixed parent commitment changed.','CONFLICT');
 step.childId=childId;step.inputHash=inputHash;if(parent)step.parent=parent;step.status='active';return next;
}

const integer:PluginSchema={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},text:PluginSchema={type:'string',maxLength:128};
const object=(properties:Record<string,PluginSchema>):PluginSchema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const mixedTransfersSchema:PluginSchema=object({dataset:{type:'string',enum:['custom-transfers-v1']},blockFrom:integer,blockTo:integer,records:{type:'array',maxItems:100,items:object({block:integer,from:text,to:text,cents:integer})}});
export function businessSummarySchema(skill:Skill):PluginSchema{
 const base={dataset:text,blockFrom:integer,blockTo:integer,transferCount:{type:'integer',minimum:0,maximum:100} as PluginSchema,totalCents:integer};
 return object(skill==='treasury-report'?{...base,recipients:{type:'array',maxItems:100,items:object({recipient:text,cents:integer})}}:skill==='event-analysis'?{...base,uniqueRecipients:{type:'integer',minimum:0,maximum:100}}:{...base,groupBy:{type:'string',enum:['from','to']},accountCount:{type:'integer',minimum:0,maximum:100},topAccounts:{type:'array',maxItems:100,items:object({account:text,amountCents:integer,shareBps:{type:'integer',minimum:0,maximum:10000}})},thresholdBps:{type:'integer',minimum:0,maximum:10000},concentrated:{type:'boolean'}});
}
/** Recipient maps have arbitrary address keys, so expose an explicit array
 * representation, never invented transfer rows or an unverifiable free-form cast. */
export function businessSummary(skill:Skill,output:Record<string,unknown>):Json{
 const value=Object.fromEntries(['dataset','blockFrom','blockTo','transferCount','totalCents'].map(k=>[k,output[k]]));
 if(skill==='treasury-report')value.recipients=Object.entries(output.allocations as Record<string,number>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([recipient,cents])=>({recipient,cents}));
 else for(const key of skill==='event-analysis'?['uniqueRecipients']:['groupBy','accountCount','topAccounts','thresholdBps','concentrated'])value[key]=output[key];
 validatePluginValue(businessSummarySchema(skill),value);return value as Json;
}
export function jsonPath(value:Json,path:string[]){let next=value;for(const key of path){if(!next||typeof next!=='object'||Array.isArray(next)||!Object.hasOwn(next,key))throw new DomainError('Mixed input path does not exist.','FORBIDDEN');next=next[key];}return structuredClone(next);}
export function mixedAdapterValue(input:MixedStep['input'],value:Json):Json|TaskInput{
 const selected=jsonPath(value,input.path);
 if(input.adapter==='transfers.v1')return normalizeInput(selected as unknown as TaskInput);
 boundedJson(selected);return selected;
}
export async function validateMixedProgram(draft:MixedWorkflowDraft,catalog:ServiceDescriptor[]){
 const body=mixedWorkflowDraftSchema.parse(draft),selected:ServiceDescriptor[]=[];
 for(const [index,step]of body.steps.entries()){
  const service=catalog.find(s=>s.id===step.serviceId);if(!service||service.digest!==step.serviceDigest)throw new DomainError('Mixed service changed. Review the current catalog.','CONFLICT');await verifyService(service);
  if(step.maxPriceCents<service.priceCents&&service.priceKind==='fixed')throw new DomainError('Mixed service exceeds its price ceiling.','FORBIDDEN');
  const edge=step.input;if(edge.from==='root'&&edge.step!==undefined||edge.from==='step'&&(edge.step===undefined||edge.step>=index))throw new DomainError('Mixed dependencies must reference an earlier step.','FORBIDDEN');
  const source=edge.from==='step'?selected[edge.step!]:undefined;
  if(service.executor==='plugin'){
   if(service.input.protocol!=='json.v1')throw new DomainError('Plugin input contract differs.');
   if(source){let schema:PluginSchema;if(source.executor==='plugin'){if(edge.adapter!=='json.v1'||source.output.protocol!=='json.v1')throw new DomainError('A JSON parent requires its explicit JSON adapter.');schema=source.output.schema;}
    else{if(edge.adapter!=='business-summary.v1')throw new DomainError('Business results require the reviewed summary adapter.');schema=businessSummarySchema(source.binding.skill as Skill);}
    if(!schemaAssignable(schemaAtPath(schema,edge.path),service.input.schema))throw new DomainError('Mixed source schema cannot satisfy the next plugin.','FORBIDDEN');
   }else{if(edge.adapter!=='json.v1')throw new DomainError('Original plugin input requires the JSON adapter.');validatePluginValue(service.input.schema,jsonPath(body.input,edge.path));}
  }else{
   if(source?.executor==='plugin'){if(edge.adapter!=='transfers.v1'||source.output.protocol!=='json.v1'||!schemaAssignable(schemaAtPath(source.output.schema,edge.path),mixedTransfersSchema))throw new DomainError('Plugin-to-skill input requires the exact transfer schema and adapter.','FORBIDDEN');}
   else if(source){if(edge.adapter!=='business-transfers.v1'||edge.path.length)throw new DomainError('Business-to-business input requires its paid projection adapter.');}
   else{if(edge.adapter!=='transfers.v1')throw new DomainError('Original skill input requires the transfer adapter.');normalizeInput(jsonPath(body.input,edge.path) as unknown as TaskInput);}
  }
  selected.push(service);
 }
 if(!selected.some(s=>s.executor==='plugin')||!selected.some(s=>s.executor!=='plugin'))throw new DomainError('A mixed workflow must contain both a skill and a plugin.');
 if(body.steps.reduce((sum,s)=>sum+s.maxPriceCents,0)>body.totalBudget)throw new DomainError('Mixed step ceilings exceed the approved total.','FORBIDDEN');return selected;
}
