import {z} from 'zod';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {pluginPaidRootSchema,type PluginPaidRoot,type PluginPurchaseWorkflow} from './plugin-purchase-protocol.ts';
import {readPluginFlow,canonicalPluginPaidRoot} from './plugin-paid-memory.ts';
import type {PluginDatabase} from './plugin-store.ts';
import type {PluginPurchaseChain} from './plugin-purchase-chain.ts';
import type {Json} from './plugin-protocol.ts';
import {servicePlanParametersSchema} from './service-program.ts';
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),flowId=z.string().regex(/^plugin-purchase-[0-9a-f-]{36}$/),cents=z.number().int().nonnegative().max(20000000);
const selection=z.object({scope:hash,sourceWorkflowId:flowId,buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),goalBudget:z.number().int().min(1).max(1000000),root:z.object({workflowId:flowId,step:z.number().int().min(0).max(7)}).strict().nullable()}).strict();
export const serviceReplanRequestSchema=z.discriminatedUnion('action',[selection.extend({action:z.literal('inspect')}),selection.extend({action:z.literal('propose'),parameters:servicePlanParametersSchema.omit({input:true})})]);
const history=z.object({workflowId:flowId,termsHash:hash,status:z.enum(['completed','failed','cancelled']),steps:z.array(z.object({taskId:hash,status:z.enum(['paid','refunded','cancelled']),priceCents:cents,fundingTx:hash.optional(),settlementTx:hash.optional()}).strict()).min(1).max(8)}).strict();
export const serviceReplanSchema=z.object({version:z.literal('agentos.service-replan.v1'),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),sourceWorkflowId:flowId,goalId:flowId,goalBudget:cents,grossSpent:cents,sourceSnapshotHash:hash,inputHash:hash,root:pluginPaidRootSchema.optional(),history:z.array(history).min(1).max(20)}).strict();
export type ServiceReplan=z.infer<typeof serviceReplanSchema>;
export type ServiceRootChoice={workflowId:string;step:number}|null;
export type ServiceReplanContext={replan:ServiceReplan;input:Json;rootChoices:{workflowId:string;step:number;pluginId:string;taskId:string}[]};
export function serviceReplanSnapshot(flow:PluginPurchaseWorkflow){return {workflowId:flow.id,termsHash:flow.termsHash,status:flow.status,steps:flow.steps.map(s=>({taskId:s.taskId,status:s.status,priceCents:s.priceCents,...(s.funding?{fundingTx:s.funding.transactionHash}:{}),...(s.settlement?{settlementTx:s.settlement.transactionHash}:{})}))};}
/** Recheck every funded attempt, including refunds, before changing the goal.
 * Terminal data is never assumed final merely because the local state says so. */
export async function buildServiceReplan(store:PluginDatabase,owner:string,sourceId:string,buyer:string,goalBudget:number,root:ServiceRootChoice,chain:PluginPurchaseChain):Promise<ServiceReplanContext>{
 const source=await readPluginFlow(store,owner,sourceId),scope=(await store.read(owner)).scope;
 if(!['failed','cancelled'].includes(source.status)||source.supersededBy||source.buyer.toLowerCase()!==buyer.toLowerCase()||source.scope!==scope||canonical(source.deployment)!==canonical(chain.deployment))throw new DomainError('Select an unreplaced terminal failed plugin workflow owned by this wallet.','FORBIDDEN');
 if(!Number.isSafeInteger(goalBudget)||goalBudget<1||goalBudget>1000000||source.repair&&source.repair.goalBudget!==goalBudget)throw new DomainError('The original cumulative repair budget cannot be reset.','FORBIDDEN');
 const flows:PluginPurchaseWorkflow[]=[],seen=new Set<string>();let current:PluginPurchaseWorkflow|undefined=source;
 while(current){
  if(seen.has(current.id)||flows.length>=20||current.scope!==scope||current.buyer.toLowerCase()!==buyer.toLowerCase()||canonical(current.deployment)!==canonical(chain.deployment)||!['completed','failed','cancelled'].includes(current.status)||current.steps.some(s=>!['paid','refunded','cancelled'].includes(s.status)))throw new DomainError('Plugin repair lineage is incomplete or unresolved.','FORBIDDEN');
  if(flows.length&&current.supersededBy!==flows.at(-1)!.id)throw new DomainError('Plugin repair lineage was superseded by another purchase.','CONFLICT');
  seen.add(current.id);flows.push(current);
  for(const step of current.steps){
   if(step.funding){await chain.funding(current,step,step.funding.transactionHash);if(!step.settlement)throw new DomainError('Plugin refund or payment is unresolved.','UNAVAILABLE');const proof=await chain.settlement(current,step,step.settlement.transactionHash);if(proof.status!==step.status||proof.status==='paid'&&proof.outputHash!==step.outputHash)throw new DomainError('Plugin repair settlement changed.','CONFLICT');}
   else if(step.fundingIntent){const view=await chain.view(current,step);if(view.status!==0||view.timestamp<BigInt(step.fundingIntent.deadline)||!step.unfundedProof)throw new DomainError('Plugin funding remains unresolved.','UNAVAILABLE');}
  }
  current=current.repair?await readPluginFlow(store,owner,current.repair.sourceWorkflowId):undefined;
 }
 const goalId=flows.at(-1)!.id;if(flows.some(f=>f.repair&&(f.repair.goalId!==goalId||f.repair.goalBudget!==goalBudget)))throw new DomainError('Plugin repair goal lineage differs.','FORBIDDEN');
 const grossSpent=flows.flatMap(f=>f.steps).filter(s=>s.funding).reduce((n,s)=>n+s.priceCents,0);if(grossSpent>=goalBudget)throw new DomainError('The cumulative repair budget is exhausted.','FORBIDDEN');
 let acceptedRoot:PluginPaidRoot|undefined,input:Json=structuredClone(flows.at(-1)!.input);
 if(root){const parent=flows.find(f=>f.id===root.workflowId),step=parent?.steps[root.step];if(!parent||step?.status!=='paid'||!step.settlement)throw new DomainError('Choose a paid result in this original goal lineage.','FORBIDDEN');const job=await store.database.prepare('SELECT data FROM agentos_plugin_executions WHERE owner_id=? AND id=?').bind(owner,step.jobId).first<{data:string}>(),execution=job?JSON.parse(job.data).execution:undefined;if(!execution)throw new DomainError('Paid repair input is unavailable.','FORBIDDEN');acceptedRoot={workflowId:parent.id,step:step.index,taskId:step.taskId,settlementTransactionHash:step.settlement.transactionHash,executionDigest:execution.digest};input=(await canonicalPluginPaidRoot(store,owner,acceptedRoot,chain,buyer)).execution.output;}
 const snapshots=flows.map(serviceReplanSnapshot),terms={version:'agentos.service-replan.v1' as const,buyer:source.buyer,sourceWorkflowId:source.id,goalId,goalBudget,grossSpent,inputHash:await digest(input),...(acceptedRoot?{root:acceptedRoot}:{}),history:snapshots};
 const replan=serviceReplanSchema.parse({...terms,sourceSnapshotHash:await digest(terms)}),rootChoices=flows.flatMap(f=>f.steps.filter(s=>s.status==='paid').map(s=>({workflowId:f.id,step:s.index,pluginId:s.pluginId,taskId:s.taskId})));return {replan,input:structuredClone(input),rootChoices};
}
export async function verifyServiceReplan(p:ServiceReplan,input:Json,totalBudget:number){
 const parsed=serviceReplanSchema.parse(p),{sourceSnapshotHash,...terms}=parsed;if(canonical(parsed)!==canonical(p)||sourceSnapshotHash!==await digest(terms)||parsed.inputHash!==await digest(input)||totalBudget>parsed.goalBudget-parsed.grossSpent||parsed.history[0].workflowId!==parsed.sourceWorkflowId||parsed.history.at(-1)!.workflowId!==parsed.goalId||new Set(parsed.history.map(h=>h.workflowId)).size!==parsed.history.length||parsed.grossSpent!==parsed.history.flatMap(h=>h.steps).filter(s=>s.fundingTx).reduce((n,s)=>n+s.priceCents,0))throw new DomainError('Service repair proposal exceeds or differs from its reviewed lineage.','FORBIDDEN');
 if(p.root&&!p.history.some(h=>h.workflowId===p.root!.workflowId&&h.steps[p.root!.step]?.taskId===p.root!.taskId&&h.steps[p.root!.step].status==='paid'&&h.steps[p.root!.step].settlementTx===p.root!.settlementTransactionHash))throw new DomainError('Repair input is outside its paid lineage.','FORBIDDEN');
}
