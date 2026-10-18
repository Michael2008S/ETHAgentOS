import { env } from 'cloudflare:workers';
import { owner,checkOrigin } from '@/lib/agentos/auth';
import { queueSummary } from '@/lib/agentos/queue';
import { DomainError } from '@/lib/agentos/engine';

async function respond(request:Request,retry=false) {
  try {
    const ownerId=owner(request);if(!env.DB)throw new Error('Database unavailable.');
    if(retry) {
      checkOrigin(request);
      if(await request.text())throw new DomainError('Queue retry takes no parameters.');
      await env.DB.prepare("UPDATE agentos_runtime_jobs SET status='pending',failures=0,last_error=NULL,available_at=?,updated_at=? WHERE owner_id=? AND status='dead'").bind(Date.now(),Date.now(),ownerId).run();
    }
    return Response.json({queue:await queueSummary(env.DB,ownerId)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof DomainError?error.message:'Queue unavailable. Retry after recovery.'},{status:error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403}[error.code]??400):503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=(request:Request)=>respond(request);
export const POST=(request:Request)=>respond(request,true);
