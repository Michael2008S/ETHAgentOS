import { env } from 'cloudflare:workers';
import { drainScope } from '@/lib/agentos/auth';
import { DomainError } from '@/lib/agentos/engine';
import { drainQueue } from '@/lib/agentos/queue-runtime';

/** No owner, task, policy, or funding parameters are accepted. */
export async function POST(request: Request) {
  try {
    const scope=drainScope(request,env.AGENTOS_RUNTIME_PRIVATE_ORIGIN);
    if(await request.text())throw new DomainError('Runtime drain takes no parameters.');
    return Response.json(await drainQueue(request,scope),{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403}[error.code]??400):503;
    return Response.json({error:error instanceof DomainError?error.message:'Runtime temporarily unavailable. Durable jobs and checkpoints are retained.'},{status,headers:{'Cache-Control':'no-store'}});
  }
}
