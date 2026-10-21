import {env} from 'cloudflare:workers';
import {authenticateConsumer} from '@/lib/agentos/consumer-auth';
import {queueSummary} from '@/lib/agentos/queue';
import {consumerState} from '@/lib/agentos/health';
import {DomainError} from '@/lib/agentos/engine';
export async function GET(request:Request){try{
 if(!env.DB)throw new Error('DB unavailable');const {ownerId,credential}=await authenticateConsumer(request,env.DB);
 const [queue,consumer,oldest]=await Promise.all([queueSummary(env.DB,ownerId),env.DB.prepare('SELECT last_seen,status,interval_ms FROM agentos_runtime_consumers WHERE scope=?').bind(ownerId).first<{last_seen:number;status:string;interval_ms:number}>(),env.DB.prepare("SELECT MIN(created_at) AS at FROM agentos_runtime_jobs WHERE owner_id=? AND status IN ('pending','leased','dead')").bind(ownerId).first<{at:number|null}>()]);
 return Response.json({version:'agentos.consumer-status.v1',checkedAt:new Date().toISOString(),intervalMs:credential.intervalMs,expiresAt:credential.expiresAt,consumer:consumerState(consumer),lastConsumerAt:consumer?new Date(consumer.last_seen).toISOString():null,oldestPendingAt:oldest?.at?new Date(oldest.at).toISOString():null,queue},{headers:{'Cache-Control':'no-store'}});
}catch(error){return Response.json({error:error instanceof DomainError?error.message:'Consumer status is unavailable.'},{status:error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403}[error.code]??400):503,headers:{'Cache-Control':'no-store'}});}}
