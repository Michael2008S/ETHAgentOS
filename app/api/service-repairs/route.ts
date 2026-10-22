import {z} from 'zod';
import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {DomainError} from '@/lib/agentos/engine';
import {canonical} from '@/cre/workflow/verify';
import {serviceRepairInputSchema,serviceRepairPolicy,createServiceRepairPolicy,setServiceRepairPolicy,verifyServiceRepairPolicy} from '@/lib/agentos/service-repair-policy';
import {configuredServiceRepairRuntime} from '@/lib/agentos/service-repair-runtime';
import {configuredServiceCatalog} from '@/lib/agentos/service-plan-runtime';
import {pluginDatabase} from '@/lib/agentos/plugin-runtime';
import {pluginRows} from '@/lib/agentos/plugin-store';
import {readPluginFlow} from '@/lib/agentos/plugin-paid-memory';
import type {PluginGrant} from '@/lib/agentos/plugin-state';
import {modelDescriptor} from '@/lib/agentos/model';
import {checkVaultSessionAllowance} from '@/lib/agentos/vault';
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),id=z.string().regex(/^service-repair-[0-9a-f-]{36}$/),headers={'Cache-Control':'private, no-store'},schema=z.union([serviceRepairInputSchema.extend({action:z.literal('configure'),scope:hash}),z.object({action:z.enum(['cancel','resume']),scope:hash,policyId:id,digest:hash}).strict()]);
export async function GET(request:Request){try{const s=await read(owner(request));return Response.json({scope:s.scope,policies:s.state.serviceRepairPolicies??[]},{headers});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415,headers});const reader=request.body?.getReader();if(!reader)throw new DomainError('JSON required.');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>65536){await reader.cancel();return Response.json({error:'Request too large.'},{status:413,headers});}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=schema.parse(JSON.parse(text)),snapshot=await read(ownerId);if(body.scope!==snapshot.scope)throw new DomainError('Plugin repair policy belongs to another workspace.','FORBIDDEN');let policyId:string,result;
 if(body.action==='configure'){
  const {action:_,scope:__,...parameters}=body;policyId='service-repair-'+parameters.requestId;const prior=snapshot.state.serviceRepairPolicies?.find(p=>p.id===policyId);
  if(prior){await verifyServiceRepairPolicy(prior);if(canonical(prior.parameters)!==canonical(parameters))throw new DomainError('Plugin repair identifier already has different limits.','IDEMPOTENCY_CONFLICT');return Response.json({scope:snapshot.scope,policy:prior},{headers});}
  const runtime=await configuredServiceRepairRuntime(request,ownerId),model=await modelDescriptor(runtime.model.configuration);
  result=await updateWorkspace(ownerId,async state=>{const source=await readPluginFlow(pluginDatabase(),ownerId,parameters.workflowId),catalog=await configuredServiceCatalog(request,ownerId,state),grants=await pluginRows<PluginGrant>(pluginDatabase().database,ownerId,'agentos_plugin_grants'),session=state.vaultSessions?.find(s=>s.sessionId===parameters.vaultSessionId);if(!session)throw new DomainError('A current signed payment session is required.','FORBIDDEN');await checkVaultSessionAllowance(runtime.chain.client,runtime.deployment,session,0);return createServiceRepairPolicy(state,parameters,snapshot.scope,source,runtime.deployment,runtime.runtimeHash,model,catalog.entries,grants);});
 }else{
  policyId=body.policyId;if(body.action==='resume'){const p=serviceRepairPolicy(snapshot.state,policyId),runtime=await configuredServiceRepairRuntime(request,ownerId),source=await readPluginFlow(pluginDatabase(),ownerId,p.activeWorkflowId);if(source.supersededBy||!['running','failed'].includes(source.status)||runtime.runtimeHash!==p.runtimeHash||canonical(await modelDescriptor(runtime.model.configuration))!==canonical(p.model)||canonical(runtime.deployment)!==canonical(p.deployment))throw new DomainError('The original plugin repair configuration changed.','FORBIDDEN');await runtime.authority(snapshot.state,p,0);}
  result=await updateWorkspace(ownerId,state=>setServiceRepairPolicy(state,policyId,body.digest,body.action));
 }
 return Response.json({scope:result.scope,policy:serviceRepairPolicy(result.state,policyId)},{headers});
}catch(error){return apiFailure(error,'runtime');}}
