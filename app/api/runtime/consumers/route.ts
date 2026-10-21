import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {owner,checkOrigin} from '@/lib/agentos/auth';
import {read} from '@/lib/agentos/store';
import {DomainError} from '@/lib/agentos/engine';
import {CONSUMER_HEADER,issueConsumer,listConsumers,revokeConsumer} from '@/lib/agentos/consumer-auth';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('issue'),id:z.string().uuid(),name:z.string().min(1).max(60),ttlSeconds:z.number().int().min(3600).max(2592000),intervalMs:z.number().int().min(1000).max(60000)}).strict(),
 z.object({action:z.literal('revoke'),id:z.string().uuid()}).strict(),
]);
async function respond(request:Request){try{
 if(request.headers.has(CONSUMER_HEADER))throw new DomainError('Consumer credentials cannot manage owner access.','FORBIDDEN');
 const ownerId=owner(request);if(!env.DB)throw new Error('DB unavailable');await read(ownerId);
 if(request.method==='GET')return Response.json({credentials:await listConsumers(env.DB,ownerId)},{headers:{'Cache-Control':'private, no-store'}});
 checkOrigin(request);if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('JSON required.');
 const text=await request.text();if(new TextEncoder().encode(text).length>4096)throw new DomainError('Consumer request is too large.');const body=schema.parse(JSON.parse(text));
 const result=body.action==='issue'?await issueConsumer(env.DB,ownerId,body):(await revokeConsumer(env.DB,ownerId,body.id),{revoked:true});
 return Response.json(result,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(error){return Response.json({error:error instanceof DomainError?error.message:error instanceof z.ZodError||error instanceof SyntaxError?'Invalid consumer request.':'Consumer access is unavailable.'},{status:error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409}[error.code]??400):error instanceof z.ZodError||error instanceof SyntaxError?400:503,headers:{'Cache-Control':'no-store'}});}}
export const GET=respond;
export const POST=respond;
