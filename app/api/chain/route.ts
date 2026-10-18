import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { owner,checkOrigin,read,updateWorkspace } from '@/lib/agentos/store';
import { DomainError } from '@/lib/agentos/engine';
import { serverChain } from '@/lib/agentos/chain-config';
import { createChainChallenge,verifyChainClaim,saveChainReceipt, type ChainClaim } from '@/lib/agentos/chain-reconciliation';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(s=>!/^0x0{40}$/.test(s));
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const url=z.string().url().max(4096).refine(s=>{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash;});
const claim=z.object({taskId:z.string().min(1).max(128),buyer:address,chainId:z.number().int().positive().safe(),escrow:address,transactionHash:hash,phase:z.enum(['funding','settlement']),spec:z.object({datasetUrl:url,artifactUrl:url,datasetHash:hash}).strict()}).strict();
const bodySchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('challenge'),claim}).strict(),
  z.object({action:z.literal('reconcile'),nonce:z.string().uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).min(130).max(8194)}).strict(),
]);
export async function POST(request:Request){
  try{
    checkOrigin(request);const ownerId=owner(request);
    if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
    const raw=await request.text();if(new TextEncoder().encode(raw).length>32768)return Response.json({error:'Request too large.'},{status:413});
    const body=bodySchema.parse(JSON.parse(raw));
    const {deployment,client}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION);
    if(body.action==='challenge'){
      const nonce=crypto.randomUUID();
      const result=await updateWorkspace(ownerId,async state=>(await createChainChallenge(state,ownerId,body.claim as ChainClaim,deployment,nonce)).state);
      return Response.json({challenge:result.state.chainChallenges!.find(c=>c.nonce===nonce)},{headers:{'Cache-Control':'no-store'}});
    }
    const {state}=await read(ownerId),verified=await verifyChainClaim(state,body.nonce,body.signature as `0x${string}`,deployment,client);
    const result=await updateWorkspace(ownerId,current=>saveChainReceipt(current,verified.challenge,verified.record));
    return Response.json({...result,record:result.state.chainReceipts!.find(r=>r.id===verified.record.id)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409,UNAVAILABLE:503}[error.code]??400):error instanceof SyntaxError||error instanceof z.ZodError?400:502;
    return Response.json({error:error instanceof z.ZodError?'Invalid chain reconciliation request.':error instanceof Error?error.message:'Chain reconciliation failed.'},{status,headers:{'Cache-Control':'no-store'}});
  }
}
