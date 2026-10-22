import {verifyMixed} from './mixed-workflow.ts';
import {z} from 'zod';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {acceptedArtifact,verifyAcceptedOrder} from './artifact-memory.ts';
import {routeRefundProof} from './purchase-route-proof.ts';
import {findOrder,type ChainOrder} from './orders.ts';
import type {Workspace} from './types.ts';
import type {AgentWorkflow} from './workflow-state.ts';
import type {OrderChain} from './order-chain.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import {skillIdSchema} from './skill-schema.ts';

const hash=z.string().regex(/^0x[0-9a-f]{64}$/),id=z.string().min(1).max(128),money=z.number().int().nonnegative().max(1000000);
export const workflowReplanSchema=z.object({
 version:z.literal('agentos.workflow-replan.v1'),sourceWorkflowId:id,lineage:z.array(id).min(1).max(8),snapshotHash:hash,originalGoal:z.string().max(500),grossSpent:money,goalBudget:money,
 roots:z.array(z.object({orderId:id,skill:skillIdSchema,artifactHash:hash,settlementTransactionHash:hash,projection:z.enum(['allocations.v1','summary-total.v1','ranked-accounts.v1']),facts:z.object({totalCents:z.number().int().nonnegative().safe().optional(),transferCount:z.number().int().nonnegative().safe().optional(),uniqueRecipients:z.number().int().nonnegative().safe().optional(),accountCount:z.number().int().nonnegative().safe().optional(),concentrated:z.boolean().optional()}).strict()}).strict()).max(32),
 failures:z.array(z.object({orderId:id,kind:z.enum(['refunded','unsent']),transactionHash:hash.optional(),blockHash:hash.optional()}).strict()).max(64),
 history:z.array(z.object({workflowId:id,index:z.number().int().min(0).max(7),skill:skillIdSchema,status:z.enum(['paid','refunded','unsent','not-started','skipped']),orderId:id.optional()}).strict()).max(64),
}).strict();
export type WorkflowReplan=z.infer<typeof workflowReplanSchema>;
const workflow=(state:Workspace,id:string)=>{const w=state.workflows?.find(w=>w.id===id);if(!w)throw new DomainError('Replanning source workflow not found.','NOT_FOUND');return w;};
function lineage(state:Workspace,sourceId:string){
 const result:AgentWorkflow[]=[],seen=new Set<string>();let current=workflow(state,sourceId);
 for(;;){if(seen.has(current.id)||result.length>=8)throw new DomainError('Workflow replanning lineage exceeds its bound.','FORBIDDEN');seen.add(current.id);result.push(current);if(!current.replan)break;const parent=workflow(state,current.replan.sourceWorkflowId);if(parent.supersededBy!==current.id)throw new DomainError('Replanning lineage is no longer linked.','CONFLICT');current=parent;}
 return result;
}
function snapshot(state:Workspace,chain:AgentWorkflow[]){return {
 workflows:chain.map(w=>{const {updatedAt:_,lastError:__,runLease:___,...terms}=w;return terms;}),
 orders:[...new Set(chain.flatMap(w=>w.steps.flatMap(s=>s.orderId?[s.orderId]:[])))].map(id=>{const o=findOrder(state,id);return {id:o.id,workflowId:o.workflowId,status:o.status,quote:o.quote,inputHash:o.inputHash,outputHash:o.outputHash,funding:o.funding?.transactionHash??null,fundingBlock:o.funding?.blockHash??null,settlement:o.settlement?{status:o.settlement.status,transactionHash:o.settlement.transactionHash,blockHash:o.settlement.blockHash,outputHash:o.settlement.outputHash}:null,vaultFunding:o.vaultFunding??null};}),
};}
export async function assertReplanSnapshot(state:Workspace,context:WorkflowReplan){
 const parsed=workflowReplanSchema.safeParse(context);if(!parsed.success||canonical(parsed.data)!==canonical(context))throw new DomainError('Invalid workflow replanning evidence.','FORBIDDEN');
 const source=workflow(state,context.sourceWorkflowId),chain=lineage(state,source.id);
 if(source.supersededBy||source.status==='completed'||canonical(chain.map(w=>w.id))!==canonical(context.lineage)||await digest(snapshot(state,chain))!==context.snapshotHash)throw new DomainError('Replanning source changed. Generate a new plan.','CONFLICT');
}
/** Release only the old program's unspent reservations in a speculative copy. */
export function replanCapacityState(state:Workspace,context:WorkflowReplan,now=new Date().toISOString()){
 const next=structuredClone(state),source=workflow(next,context.sourceWorkflowId);source.status='cancelled';source.updatedAt=now;
 for(const s of source.steps)if(s.orderId){const o=findOrder(next,s.orderId);if(!o.funding&&!o.settlement){o.status='cancelled';o.updatedAt=now;}}
 return next;
}
export async function buildWorkflowReplan(state:Workspace,sourceId:string,buyer:string,deployment:WalletDeployment,chain:OrderChain,goalBudget:number):Promise<WorkflowReplan>{
 const source=workflow(state,sourceId);if(source.supersededBy||source.status==='completed')throw new DomainError('Only an unfinished, unsuperseded workflow can be replanned.','FORBIDDEN');
 const ancestors=lineage(state,sourceId),roots:WorkflowReplan['roots']=[],failures:WorkflowReplan['failures']=[],history:WorkflowReplan['history']=[];let grossSpent=0;
 for(const w of ancestors){
  if(w.buyer.toLowerCase()!==buyer.toLowerCase()||canonical(w.deployment)!==canonical(deployment))throw new DomainError('Replanning source belongs to another buyer or deployment.','FORBIDDEN');
  for(const [index,step] of w.steps.entries()){
   if(!step.orderId){history.push({workflowId:w.id,index,skill:step.skill,status:step.skippedAt?'skipped':'not-started'});continue;}
   const order=findOrder(state,step.orderId);if(order.workflowId!==w.id||order.buyer.toLowerCase()!==buyer.toLowerCase()||canonical(order.deployment)!==canonical(deployment))throw new DomainError('Replanning order is outside its source workflow.','FORBIDDEN');
   if(order.funding)grossSpent+=order.quote;
   let status:WorkflowReplan['history'][number]['status'];
   if(order.status==='completed'&&order.settlement?.status==='paid'){
    await verifyAcceptedOrder(state,order,chain);const memory=acceptedArtifact(order);if(!order.funding)throw new DomainError('Replanning payment lacks its funding checkpoint.','CONFLICT');
    const facts=Object.fromEntries(['totalCents','transferCount','uniqueRecipients','accountCount','concentrated'].filter(key=>Object.hasOwn(order.output!,key)).map(key=>[key,order.output![key]]));
    roots.push({orderId:order.id,skill:order.skill,artifactHash:memory.artifactHash,settlementTransactionHash:memory.settlementTransactionHash,projection:memory.projection??'allocations.v1',facts});status='paid';
   }else if(order.status==='refunded'&&order.settlement?.status==='refunded'){
    const proof=await routeRefundProof(order,chain);if(!proof||proof.kind!=='refunded'||!order.funding)throw new DomainError('Wait for canonical refund finality before replanning.','UNAVAILABLE');failures.push({orderId:order.id,kind:'refunded',transactionHash:proof.transactionHash,blockHash:proof.blockHash});status='refunded';
   }else if(!order.funding&&!order.settlement&&(!order.vaultFunding||order.status==='cancelled')){
    const view=await chain.inspect(order);if(view.status!==0||order.vaultFunding&&BigInt(order.vaultFunding.deadline)>view.timestamp)throw new DomainError('An earlier funding intent is still unresolved. Reconcile it before replanning.','UNAVAILABLE');failures.push({orderId:order.id,kind:'unsent'});status='unsent';
   }else throw new DomainError('Finish or refund all outstanding source orders before replanning.','UNAVAILABLE');
   history.push({workflowId:w.id,index,skill:step.skill,status,orderId:order.id});
  }
 }
 if(!history.some(s=>s.workflowId===sourceId&&!['paid','skipped'].includes(s.status)))throw new DomainError('The source has no unfinished steps to replan.','FORBIDDEN');
 if(!Number.isSafeInteger(goalBudget)||goalBudget<grossSpent||goalBudget>1000000||roots.length>32)throw new DomainError('The gross goal ceiling must cover all previous funded attempts.','FORBIDDEN');
 const root=ancestors.at(-1)!,goal=state.workflowPlans?.find(p=>p.id===root.planId)?.parameters.goal??root.title;
 return workflowReplanSchema.parse({version:'agentos.workflow-replan.v1',sourceWorkflowId:sourceId,lineage:ancestors.map(w=>w.id),snapshotHash:await digest(snapshot(state,ancestors)),originalGoal:goal,grossSpent,goalBudget,roots,failures,history});
}
/** Called again before each new funding intent, including roots not chosen by that child. */
export async function verifyReplanFunding(state:Workspace,order:ChainOrder,chain:OrderChain){
 if(!order.workflowId)return;const mixed=state.mixedWorkflows?.find(f=>f.id===order.workflowId);if(mixed){await verifyMixed(mixed);const step=mixed.steps.find(s=>s.childId===order.id);if(mixed.status!=='running'||!step||step.service.executor==='plugin'||step.inputHash!==order.inputHash||step.requestId!==order.requestId||step.service.binding.agentId!==order.agentId||step.maxPriceCents!==order.budget||mixed.buyer.toLowerCase()!==order.buyer.toLowerCase()||canonical(mixed.deployment)!==canonical(order.deployment))throw new DomainError('Mixed funding commitment changed.','FORBIDDEN');return;}const current=workflow(state,order.workflowId);if(!current.replan)return;
 const context=current.replan,source=workflow(state,context.sourceWorkflowId),proposal=state.workflowPlans?.find(p=>p.id===current.planId);
 if(current.status!=='running'||source.supersededBy!==current.id||!proposal||proposal.status!=='accepted'||proposal.workflowId!==current.id||canonical(proposal.replan)!==canonical(context))throw new DomainError('Replanned workflow no longer authorizes new funding.','FORBIDDEN');
 const {digest:expected,status:_,workflowId:__,acceptedAt:___,dismissedAt:____,...terms}=proposal;
 if(await digest(terms)!==expected||current.parallelism!==proposal.draft.parallelism||canonical(current.steps.map(s=>({agentId:s.agentId,budget:s.budget,input:s.input,...(s.when?{when:s.when}:{}),...(s.supplierId?{supplierId:s.supplierId}:{})})))!==canonical(proposal.draft.steps)||canonical(current.input)!==canonical(proposal.draft.input)||current.buyer.toLowerCase()!==order.buyer.toLowerCase()||canonical(current.deployment)!==canonical(order.deployment))throw new DomainError('Replanned workflow differs from its approved program.','FORBIDDEN');
 const selected=current.steps.find(s=>s.orderId===order.id);if(!selected||selected.agentId!==order.agentId||selected.budget!==order.budget||selected.input?.from==='accepted'&&order.input.memory?.orderId!==selected.input.orderId)throw new DomainError('Replanned child differs from its approved input.','FORBIDDEN');
 for(const failure of context.failures){const original=findOrder(state,failure.orderId),proof=await routeRefundProof(original,chain);if(!proof||proof.kind!==failure.kind||failure.kind==='refunded'&&(proof.transactionHash!==failure.transactionHash||proof.blockHash!==failure.blockHash))throw new DomainError('Earlier replanning refund is no longer canonically finalized.','UNAVAILABLE');}
}
