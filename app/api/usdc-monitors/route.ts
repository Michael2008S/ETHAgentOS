import {monitorRenewalPreview} from '@/lib/agentos/usdc-monitor-renewal';
import {z} from 'zod';
import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {deferInline} from '@/lib/agentos/auth';
import {DomainError} from '@/lib/agentos/engine';
import {usdcMonitorDraftSchema,findMonitor,publicMonitor,controlMonitor,verifyMonitor} from '@/lib/agentos/usdc-monitor-state';
import {createUSDCMonitor} from '@/lib/agentos/usdc-monitor-store';
import {runUSDCMonitor} from '@/lib/agentos/usdc-monitor-runner';
import {configuredMonitorRuntime,scheduleMonitors} from '@/lib/agentos/usdc-monitor-runtime';
import {mixedStore} from '@/lib/agentos/mixed-workflow-runtime';
const headers={'Cache-Control':'private, no-store'},id=z.string().regex(/^usdc-monitor-[0-9a-f-]{36}$/),scope=z.string().regex(/^0x[0-9a-f]{64}$/);
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('create'),scope,draft:usdcMonitorDraftSchema}).strict(),z.object({action:z.enum(['pause','resume','stop','recover','renew-preview']),scope,id}).strict()]);
export async function GET(request:Request){try{const snapshot=await read(owner(request)),target=new URL(request.url).searchParams.get('id');if(target){id.parse(target);return Response.json({scope:snapshot.scope,monitor:publicMonitor(findMonitor(snapshot.state,target))},{headers});}return Response.json({scope:snapshot.scope,monitors:(snapshot.state.usdcMonitors??[]).map(publicMonitor)},{headers});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))throw new DomainError('JSON required.');const reader=request.body?.getReader();if(!reader)throw new DomainError('JSON required.');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>16384)throw new DomainError('Monitor request exceeds its byte bound.');text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=schema.parse(JSON.parse(text)),snapshot=await read(ownerId);if(snapshot.scope!==body.scope)throw new DomainError('Monitor request belongs to another workspace.','FORBIDDEN');const runtime=configuredMonitorRuntime(request,ownerId);let monitor;
 if(body.action==='renew-preview')return Response.json({scope:snapshot.scope,renewal:await monitorRenewalPreview(snapshot.state,body.id)},{headers});if(body.action==='create')monitor=await createUSDCMonitor(mixedStore(),ownerId,body.draft,runtime.context);else if(body.action==='recover'){await runUSDCMonitor(mixedStore(),ownerId,body.id,async()=>runtime);monitor=findMonitor((await read(ownerId)).state,body.id);}else monitor=findMonitor((await updateWorkspace(ownerId,async state=>{await verifyMonitor(findMonitor(state,body.id));return controlMonitor(state,body.id,body.action as 'pause'|'resume'|'stop');})).state,body.id);
 if(!deferInline(request))scheduleMonitors(request,ownerId,(await read(ownerId)).state);return Response.json({scope:snapshot.scope,monitor:publicMonitor(monitor)},{headers});
 }catch(error){return apiFailure(error,'runtime');}}
