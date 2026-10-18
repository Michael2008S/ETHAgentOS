import { z } from 'zod';
import { owner,checkOrigin,read,updateWorkspace } from '@/lib/agentos/store';
import { DomainError,normalizeInput } from '@/lib/agentos/engine';
import { activateOrder,authorizeOrder,createOrder,findOrder,finishOrder,orderArtifact,orderEvent,type OrderDraft } from '@/lib/agentos/orders';
import { configuredOrderChain,scheduleOrders } from '@/lib/agentos/order-runtime';
import { runOrder } from '@/lib/agentos/order-runner';
import { inputEvidence } from '@/sdk/wallet';
import type { DeliverySpec } from '@/cre/workflow/verify';
import { inspectIdentity } from '@/lib/agentos/identity';
import { canonical } from '@/cre/workflow/verify';
const id=z.string().min(1).max(128),hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/),address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(s=>!/^0x0{40}$/.test(s));
const input=z.object({dataset:z.enum(['eth-shenzhen-fixture-v1','custom-transfers-v1']),blockFrom:z.number().int().nonnegative().safe(),blockTo:z.number().int().nonnegative().safe(),records:z.array(z.object({block:z.number().int().nonnegative().safe(),from:z.string().min(1).max(128),to:z.string().min(1).max(128),cents:z.number().int().nonnegative().safe()}).strict()).min(1).max(100).optional()}).strict();
const https=z.string().url().max(4096).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;});
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),planner:z.enum(['deterministic','llm']).default('deterministic'),requestId:z.string().uuid(),title:z.string().trim().min(1).max(160),agentId:id,budget:z.number().int().positive().max(1000000),buyer:address,input:input.optional(),scenario:z.enum(['success','injection','interruption','invalid-delivery']).default('success'),timeoutSeconds:z.number().int().min(1).max(86400).default(300),spec:z.object({datasetUrl:https,artifactUrl:https,datasetHash:hash}).strict().optional()}).strict(),
  z.object({action:z.literal('challenge'),orderId:id,transactionHash:hash}).strict(),
  z.object({action:z.literal('activate'),orderId:id,nonce:z.string().uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).min(130).max(8194)}).strict(),
  z.object({action:z.literal('sync'),orderId:id,transactionHash:hash.optional()}).strict(),
  z.object({action:z.literal('cancel'),orderId:id}).strict(),
  z.object({action:z.literal('resume'),orderId:id}).strict(),
]);
function failure(error:unknown){const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409,IDEMPOTENCY_CONFLICT:409,UNAVAILABLE:503}[error.code]??400):error instanceof z.ZodError||error instanceof SyntaxError?400:502;return Response.json({error:error instanceof z.ZodError?'Invalid onchain order request.':error instanceof DomainError?error.message:error instanceof SyntaxError?'Invalid JSON request.':'Onchain provider or delivery service is unavailable. Retry the same order after recovery.'},{status,headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 try{
  checkOrigin(request);const ownerId=owner(request);
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
  const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return Response.json({error:'Request too large.'},{status:413});
  const body=schema.parse(JSON.parse(raw)),configured=await configuredOrderChain(request),{chain,deployment,localCall,planner,client}=configured;
  if(body.action==='create'){
   const snapshot=await read(ownerId),prior=snapshot.state.chainOrders?.find(o=>o.requestId===body.requestId),normalized=normalizeInput(body.input),bytes=inputEvidence({id:'chain-'+body.requestId,input:normalized},body.buyer as `0x${string}`);
   const spec=prior?.spec??(localCall?await localCall<DeliverySpec>('/drafts',bytes):body.spec);
   if(!spec||spec.datasetHash!==bytes.datasetHash||body.spec&&canonical(body.spec)!==canonical(spec))throw new DomainError('Evidence URLs and hash must match the committed order input.');
   if(body.planner==='llm'&&!planner)throw new DomainError('Model service is not configured.','UNAVAILABLE');
   const bound=prior?prior.agentIdentity:snapshot.state.agentIdentities?.find(i=>i.agentId===body.agentId);
   const identity=bound?(prior?bound:await inspectIdentity(client,deployment,bound)):undefined;
   const {action:_,...fields}=body,draft={...fields,spec,input:normalized,...(body.planner==='llm'?{model:planner!.descriptor}:{}),...(identity?{agentIdentity:identity}:{})} as OrderDraft;
   const result=await updateWorkspace(ownerId,state=>createOrder(state,draft,deployment));return Response.json({...result,order:findOrder(result.state,'chain-'+body.requestId)},{headers:{'Cache-Control':'no-store'}});
  }
  const {state}=await read(ownerId),order=findOrder(state,body.orderId);
  if(body.action==='challenge'){
   const nonce=crypto.randomUUID(),result=await updateWorkspace(ownerId,async current=>(await authorizeOrder(current,body.orderId,ownerId,body.transactionHash as `0x${string}`,nonce)).state);
   return Response.json({order:findOrder(result.state,body.orderId)},{headers:{'Cache-Control':'no-store'}});
  }
  let result;
  if(body.action==='activate'){
   const auth=order.authorization;if(!auth||auth.nonce!==body.nonce)throw new DomainError('Order authorization does not match.','CONFLICT');
   if(!await chain.verifySignature(order,auth.message,body.signature as `0x${string}`))throw new DomainError('Buyer signature does not authorize this workspace order.','FORBIDDEN');
   if(order.funding)result=await read(ownerId);
   else{const funding=await chain.funding(order,auth.transactionHash);result=await updateWorkspace(ownerId,current=>activateOrder(current,body.orderId,body.nonce,funding));}
  }else if(body.action==='sync'){
   if(body.transactionHash){const evidence=await chain.settlement(order,body.transactionHash as `0x${string}`);result=await updateWorkspace(ownerId,current=>finishOrder(current,body.orderId,evidence));}
   else{const execution=await runOrder({read,updateWorkspace},ownerId,body.orderId,chain,{planner});if(execution.status==='retryable')throw new DomainError('Order checkpoint retained. Retry synchronization after chain recovery.','UNAVAILABLE');result=await read(ownerId);}
  }else{
   const view=await chain.inspect(order);
   result=await updateWorkspace(ownerId,current=>{
    const next=structuredClone(current),o=findOrder(next,body.orderId);
    if(body.action==='resume'){if(o.status==='paused'&&o.settlement?.status==='paid'){o.status='completed';o.step=6;orderEvent(o,'Order completed','Resumed an existing paid receipt without another transaction.',undefined,'success');}return next;}
    if(o.settlement)return current;
    if(o.settlementAuthorization)throw new DomainError('Settlement intent is already committed. Reconcile its existing transaction.','CONFLICT');
    if(!o.funding){if(view.status!==0)throw new DomainError('Confirm this escrow funding before cancelling or refund it directly after its deadline.');o.status='cancelled';}
    else{o.failure='Order cancelled by its owner.';o.status='awaiting-settlement';}
    orderEvent(o,'Cancellation requested','No new skill operations will run. Any funded escrow still requires a mined refund.');return next;
   });
  }
  scheduleOrders(ownerId,result.state,request);return Response.json({...result,order:findOrder(result.state,body.orderId)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
export async function GET(request:Request){
 try{const url=new URL(request.url),result=await read(owner(request));if(url.searchParams.has('id')){const order=findOrder(result.state,url.searchParams.get('id')!),kind=url.searchParams.get('kind'),bytes=inputEvidence(order,order.buyer);if(kind==='artifact'&&!order.output&&!order.failure)throw new DomainError('Order artifact is not ready.','NOT_FOUND');if(kind&&!['dataset','artifact'].includes(kind))throw new DomainError('Unknown order export format.');const raw=kind==='dataset'?bytes.datasetText:kind==='artifact'?orderArtifact(order,bytes.id):JSON.stringify({version:'agentos.chain-order.v1',order},null,2)+'\n';return new Response(raw,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${order.id.replace(/[^a-zA-Z0-9-]/g,'_')}${kind?'-'+kind:''}.json"`}});}return Response.json({orders:result.state.chainOrders??[]},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}
}
