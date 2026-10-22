import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { owner,checkOrigin,read,updateWorkspace } from '@/lib/agentos/store';
import { serverIdentityChain } from '@/lib/agentos/identity-chain-config';
import { previewIdentityOrder } from '@/lib/agentos/identity-order-preview';
import { serverChain } from '@/lib/agentos/chain-config';
import { DomainError } from '@/lib/agentos/engine';
import { bindIdentity,createIdentityChallenge,feedbackTransaction,identityDocument,inspectIdentity,prepareFeedback,saveFeedback,saveFeedbackIntent,validateRegistries,verifyFeedback,verifyRegistration } from '@/lib/agentos/identity';
const id=z.string().min(1).max(128),hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/),token=z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v=>BigInt(v)<2n**256n);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare'),agentId:id}).strict(),
 z.object({action:z.literal('existing-challenge'),agentId:id,registryAgentId:token,transactionHash:hash}).strict(),
 z.object({action:z.literal('order-preview'),requestId:z.string().uuid(),agentId:id,title:z.string().trim().min(1).max(160),budget:z.number().int().positive().max(1000000),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>!/^0x0{40}$/.test(v))}).strict(),
 z.object({action:z.literal('challenge'),agentId:id,registryAgentId:token,transactionHash:hash}).strict(),
 z.object({action:z.literal('bind'),nonce:z.string().uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).min(130).max(8194)}).strict(),
 z.object({action:z.literal('refresh'),agentId:id}).strict(),
 z.object({action:z.literal('feedback-prepare'),orderId:id,score:z.number().int().min(0).max(100)}).strict(),
 z.object({action:z.literal('feedback-confirm'),orderId:id,transactionHash:hash}).strict(),
]);
function failure(error:unknown){const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409,IDEMPOTENCY_CONFLICT:409,UNAVAILABLE:503}[error.code]??400):error instanceof z.ZodError||error instanceof SyntaxError?400:502;return Response.json({error:error instanceof DomainError?error.message:status===400?'Invalid identity request.':'Identity provider is unavailable. Retry with the same transaction.'},{status,headers:{'Cache-Control':'no-store'}});}
const response=(body:unknown)=>Response.json(body,{headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){try{const ownerId=owner(request),snapshot=await read(ownerId),{client,deployment}=await serverIdentityChain(request,env.AGENTOS_IDENTITY_CONFIGURATION,env.AGENTOS_CHAIN_CONFIGURATION);await validateRegistries(client,deployment);return response({deployment,identities:snapshot.state.agentIdentities??[],feedback:snapshot.state.agentFeedback??[]});}catch(error){return failure(error);}}
export async function POST(request:Request){
 try{
  checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
  const text=await request.text();if(new TextEncoder().encode(text).length>32768)return Response.json({error:'Request too large.'},{status:413});
  const body=schema.parse(JSON.parse(text)),{client,deployment}=await serverIdentityChain(request,env.AGENTOS_IDENTITY_CONFIGURATION,env.AGENTOS_CHAIN_CONFIGURATION),snapshot=await read(ownerId);await validateRegistries(client,deployment);
  if(body.action==='prepare')return response({...await identityDocument(snapshot.state,ownerId,body.agentId,new URL(request.url).origin),deployment});
  if(body.action==='order-preview'){
   const bound=snapshot.state.agentIdentities?.find(i=>i.agentId===body.agentId);if(!bound)throw new DomainError('Bind the identity first.','CONFLICT');
   const verified=await inspectIdentity(client,deployment,bound),result=await updateWorkspace(ownerId,state=>previewIdentityOrder(state,snapshot.scope,{requestId:body.requestId,agentId:body.agentId,title:body.title,budget:body.budget,buyer:body.buyer as `0x${string}`},verified));
   return response({preview:result.state.identityOrderPreviews?.find(p=>p.requestId===body.requestId),scope:result.scope});
  }
  if(body.action==='challenge'||body.action==='existing-challenge'){
   const identity=await verifyRegistration(snapshot.state,ownerId,body.agentId,body.registryAgentId,body.transactionHash as `0x${string}`,new URL(request.url).origin,client,deployment,body.action==='existing-challenge'),nonce=crypto.randomUUID();
   const result=await updateWorkspace(ownerId,state=>createIdentityChallenge(state,ownerId,identity,nonce));return response({challenge:result.state.identityChallenges!.find(c=>c.nonce===nonce)});
  }
  if(body.action==='bind'){
   const challenge=snapshot.state.identityChallenges?.find(c=>c.nonce===body.nonce);if(!challenge)throw new DomainError('Identity challenge not found.','NOT_FOUND');
   if(!await client.verifyMessage({address:challenge.identity.owner,message:challenge.message,signature:body.signature as `0x${string}`}))throw new DomainError('Registry owner signature is required.','FORBIDDEN');
   const verified=await inspectIdentity(client,deployment,challenge.identity),result=await updateWorkspace(ownerId,state=>bindIdentity(state,body.nonce,verified));return response(result);
  }
  if(body.action==='refresh'){
   const identity=snapshot.state.agentIdentities?.find(i=>i.agentId===body.agentId);if(!identity)throw new DomainError('Identity not found.','NOT_FOUND');
   let updated;try{updated=await inspectIdentity(client,deployment,identity);}catch(error){if(!(error instanceof DomainError))throw error;updated={...identity,status:'stale' as const,checkedAt:new Date().toISOString()};}
   const result=await updateWorkspace(ownerId,state=>({...state,agentIdentities:state.agentIdentities?.map(i=>i.agentId===body.agentId&&i.documentHash===identity.documentHash&&i.registryAgentId===identity.registryAgentId?updated:i)}));return response(result);
  }
  const settlement=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION);
  if(body.action==='feedback-prepare'){
   const intent=await prepareFeedback(snapshot.state,body.orderId,body.score,settlement.client,settlement.deployment),result=await updateWorkspace(ownerId,state=>saveFeedbackIntent(state,intent)),saved=result.state.agentFeedback!.find(f=>f.orderId===body.orderId)!;
   return response({intent:saved,transaction:feedbackTransaction(saved),deployment:settlement.deployment});
  }
  const verified=await verifyFeedback(snapshot.state,body.orderId,body.transactionHash as `0x${string}`,settlement.client,settlement.deployment),result=await updateWorkspace(ownerId,state=>saveFeedback(state,verified));return response(result);
 }catch(error){return failure(error);}
}
