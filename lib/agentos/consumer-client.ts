import {CONSUMER_HEADER} from './auth.ts';
import type {ServiceState} from './health.ts';
export class ConsumerFailure extends Error{kind:'authentication'|'unavailable'|'invalid-response';constructor(kind:ConsumerFailure['kind']){super(kind==='authentication'?'Consumer authentication was refused.':kind==='invalid-response'?'Consumer returned an invalid response.':'Consumer service is unavailable.');this.kind=kind;}}
type QueueCounts={pending:number;leased:number;completed:number;dead:number};
export type DrainResult={claimed:number;completed:number;rescheduled:number;failed:number;queue:QueueCounts};
export type ConsumerStatus={version:'agentos.consumer-status.v1';checkedAt:string;intervalMs:number;expiresAt:string;consumer:ServiceState;lastConsumerAt:string|null;oldestPendingAt:string|null;queue:QueueCounts};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string)=>Object.keys(v).sort().join(',')===expected;
const count=(v:unknown,max=1000000)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
function queue(value:unknown):value is QueueCounts{return object(value)&&keys(value,'completed,dead,leased,pending')&&Object.values(value).every(v=>count(v));}
const date=(v:unknown)=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
export function createConsumerClient(configuration:{origin:string;token:string;gatewayBearer?:string},request:typeof fetch=fetch){
 let url:URL;try{url=new URL(configuration.origin);}catch{throw new Error('Invalid consumer configuration.');}if(url.origin!==configuration.origin||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))||!/^aos_rt_[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(configuration.token)||configuration.gatewayBearer&&(/[\r\n]/.test(configuration.gatewayBearer)||configuration.gatewayBearer.length>8192))throw new Error('Invalid consumer configuration.');
 async function call(path:string,method:string,signal?:AbortSignal){
  let response:Response;try{response=await request(url.origin+path,{method,redirect:'manual',headers:{[CONSUMER_HEADER]:configuration.token,...(configuration.gatewayBearer?{Authorization:'Bearer '+configuration.gatewayBearer}:{})},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});}catch{throw new ConsumerFailure('unavailable');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ConsumerFailure(response.status===401||response.status===403?'authentication':'unavailable');}
  const reader=response.body?.getReader();if(!reader)throw new ConsumerFailure('invalid-response');let size=0,text='';const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>16384){await reader.cancel().catch(()=>{});throw new ConsumerFailure('invalid-response');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}catch(error){if(error instanceof ConsumerFailure)throw error;throw new ConsumerFailure('unavailable');}finally{reader.releaseLock();}
  try{return JSON.parse(text) as unknown;}catch{throw new ConsumerFailure('invalid-response');}
 }
 return {
  async drain(signal?:AbortSignal):Promise<DrainResult>{const v=await call('/api/runtime/drain','POST',signal);if(!object(v)||!keys(v,'claimed,completed,failed,queue,rescheduled')||![v.claimed,v.completed,v.rescheduled,v.failed].every(n=>count(n,4))||!queue(v.queue))throw new ConsumerFailure('invalid-response');return v as DrainResult;},
  async status(signal?:AbortSignal):Promise<ConsumerStatus>{const v=await call('/api/runtime/consumer-status','GET',signal);if(!object(v)||!keys(v,'checkedAt,consumer,expiresAt,intervalMs,lastConsumerAt,oldestPendingAt,queue,version')||v.version!=='agentos.consumer-status.v1'||!date(v.checkedAt)||!date(v.expiresAt)||v.lastConsumerAt!==null&&!date(v.lastConsumerAt)||v.oldestPendingAt!==null&&!date(v.oldestPendingAt)||!count(v.intervalMs,60000)||Number(v.intervalMs)<1000||!['healthy','unavailable','not-configured','stale','busy','unchecked'].includes(String(v.consumer))||!queue(v.queue))throw new ConsumerFailure('invalid-response');return v as ConsumerStatus;},
 };
}
