import {z} from 'zod';
import {env} from 'cloudflare:workers';
import * as store from '@/lib/agentos/store';
import {checkOrigin,owner} from '@/lib/agentos/auth';
import {DomainError} from '@/lib/agentos/engine';
import {apiFailure} from '@/lib/agentos/api-failure';
import {ccipDraftSchema,createCCIPTask,ccipJob,ccipTerminal,runCCIPTask} from '@/lib/agentos/ccip-tasks';
import {configuredCCIPDeployment,configuredCCIPTransport,ccipOrigin} from '@/lib/agentos/ccip-runtime';
const id=z.string().regex(/^ccip-[0-9a-f-]{36}$/),scope=z.string().regex(/^0x[0-9a-f]{64}$/),headers={'Cache-Control':'private, no-store'};
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('create'),scope,draft:ccipDraftSchema}).strict(),z.object({action:z.enum(['cancel','recover']),scope,id}).strict()]);
export async function GET(request:Request){try{ccipOrigin(request);const snapshot=await store.read(owner(request)),target=new URL(request.url).searchParams.get('id');return Response.json({scope:snapshot.scope,...(target?{task:ccipJob(snapshot.state,id.parse(target))}:{tasks:snapshot.state.ccipTasks??[]})},{headers});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{ccipOrigin(request);checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('JSON required.');const reader=request.body?.getReader();if(!reader)throw new DomainError('JSON required.');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>16384)throw new DomainError('CCIP request exceeds bound.');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=schema.parse(JSON.parse(text)),snapshot=await store.read(ownerId);if(snapshot.scope!==body.scope)throw new DomainError('CCIP workspace mismatch.','FORBIDDEN');let task;
 if(body.action==='create')task=await createCCIPTask(store,ownerId,body.draft,()=>configuredCCIPDeployment(request));
 else {task=ccipJob(snapshot.state,body.id);if(body.action==='cancel')task=ccipJob((await store.updateWorkspace(ownerId,s=>{const next=structuredClone(s),j=ccipJob(next,body.id);if(!ccipTerminal(j)){j.cancelRequested=true;j.status='cancelling';}return next;})).state,body.id);
  if(body.action==='recover'){await env.DB?.prepare("UPDATE agentos_runtime_jobs SET status='pending',failures=0,last_error=NULL,available_at=?,updated_at=? WHERE owner_id=? AND kind='ccip' AND task_id=? AND status='dead'").bind(Date.now(),Date.now(),ownerId,body.id).run();await runCCIPTask(store,ownerId,body.id,()=>configuredCCIPTransport(request));task=ccipJob((await store.read(ownerId)).state,body.id);}}
 return Response.json({scope:snapshot.scope,task},{headers});
 }catch(error){return apiFailure(error,'runtime');}}
