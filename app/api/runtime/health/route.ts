import { env } from 'cloudflare:workers';
import { owner,isLoopback } from '@/lib/agentos/auth';
import { read } from '@/lib/agentos/store';
import { serverChain } from '@/lib/agentos/chain-config';
import { queueSummary } from '@/lib/agentos/queue';
import { consumerState,type ServiceState } from '@/lib/agentos/health';
import { apiFailure } from '@/lib/agentos/api-failure';
import {localServices} from '@/lib/agentos/local-services';
async function healthy(url:string){try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(2000)});await r.body?.cancel();return r.ok;}catch{return false;}}
export async function GET(request:Request){
 try{
  const ownerId=owner(request);await read(ownerId);if(!env.DB)throw new Error('DB unavailable');
  const local=Boolean(import.meta.env.DEV)&&isLoopback(new URL(request.url));
  const [chain,model,planning,supplier,queue,consumer,oldest]=await Promise.all([
   serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION).then(async({client,deployment})=>{const [id,code]=await Promise.all([client.getChainId(),client.getCode({address:deployment.escrow})]);return id===deployment.chainId&&!!code&&code!=='0x'?'healthy':'unavailable';}).catch(()=>local||env.AGENTOS_CHAIN_CONFIGURATION?'unavailable':'not-configured'),
   local?healthy('http://127.0.0.1:11435/health').then(ok=>ok?'healthy':'unavailable'):Promise.resolve(env.AGENTOS_MODEL_CONFIGURATION?'unchecked':'not-configured'),
   local?healthy('http://127.0.0.1:11436/health').then(ok=>ok?'healthy':'unavailable'):Promise.resolve(env.AGENTOS_WORKFLOW_MODEL_CONFIGURATION||env.AGENTOS_MODEL_CONFIGURATION?'unchecked':'not-configured'),
   local?healthy(localServices().supplier+'/health').then(ok=>ok?'healthy':'unavailable'):Promise.resolve(env.AGENTOS_SUPPLIER_CONFIGURATION?'unchecked':'not-configured'),
   queueSummary(env.DB,ownerId),
   env.DB.prepare('SELECT last_seen,status,interval_ms FROM agentos_runtime_consumers WHERE scope IN (?,?) ORDER BY last_seen DESC LIMIT 1').bind(ownerId,'__service__').first<{last_seen:number;status:string;interval_ms:number}>(),
   env.DB.prepare("SELECT MIN(created_at) AS at FROM agentos_runtime_jobs WHERE owner_id=? AND status IN ('pending','leased','dead')").bind(ownerId).first<{at:number|null}>(),
  ]);
  const services:Record<string,ServiceState>={database:'healthy',chain:chain as ServiceState,model:model as ServiceState,planning:planning as ServiceState,supplier:supplier as ServiceState,consumer:consumerState(consumer)};
  return Response.json({checkedAt:new Date().toISOString(),ready:Object.values(services).every(s=>s==='healthy'||s==='busy')&&!queue.dead,services,queue,lastConsumerAt:consumer?new Date(consumer.last_seen).toISOString():null,oldestPendingAt:oldest?.at?new Date(oldest.at).toISOString():null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return apiFailure(error,'runtime');}
}
