import {z} from 'zod';
import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {DomainError} from '@/lib/agentos/engine';
import {canonical} from '@/cre/workflow/verify';
import {configuredServiceCatalog} from '@/lib/agentos/service-plan-runtime';
import {workflowPlanningModel} from '@/lib/agentos/model-runtime';
import {servicePlanParametersSchema,generateServiceProposal,saveServiceProposal,servicePlan} from '@/lib/agentos/service-plans';
const headers={'Cache-Control':'private, no-store'},hash=z.string().regex(/^0x[0-9a-f]{64}$/);
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('propose'),parameters:servicePlanParametersSchema,scope:hash}).strict(),z.object({action:z.literal('dismiss'),planId:z.string().min(1).max(100),scope:hash}).strict()]);
export async function GET(request:Request){try{const ownerId=owner(request),s=await read(ownerId),catalogue=new URL(request.url).searchParams.get('catalogue')==='1';return Response.json({scope:s.scope,plans:s.state.servicePlans??[],businessPlans:s.state.workflowPlans??[],...(catalogue?{catalogue:await configuredServiceCatalog(request,ownerId,s.state)}:{})},{headers});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415,headers});
 const reader=request.body?.getReader();if(!reader)throw new DomainError('JSON required.');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>65536){await reader.cancel();return Response.json({error:'Request too large.'},{status:413,headers});}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=schema.parse(JSON.parse(text)),snapshot=await read(ownerId);if(body.scope!==snapshot.scope)throw new DomainError('Service plan belongs to another workspace.','FORBIDDEN');
 let id:string;if(body.action==='propose'){
  id='service-plan-'+body.parameters.requestId;const prior=snapshot.state.servicePlans?.find(p=>p.id===id);
  if(prior){if(prior.template||prior.replan||canonical(prior.parameters)!==canonical(body.parameters))throw new DomainError('Service plan identifier already has different parameters.','IDEMPOTENCY_CONFLICT');}
  else{const catalog=await configuredServiceCatalog(request,ownerId,snapshot.state),model=workflowPlanningModel(request),proposal=await generateServiceProposal(snapshot.state,body.parameters,snapshot.scope,catalog.entries,model.configuration,model.key);await updateWorkspace(ownerId,state=>saveServiceProposal(state,proposal,snapshot.scope));}
 }else{id=body.planId;await updateWorkspace(ownerId,state=>{const p=servicePlan(state,id);if(p.status==='accepted')throw new DomainError('An accepted service plan cannot be dismissed.','CONFLICT');return {...state,servicePlans:state.servicePlans!.map(p=>p.id===id?{...p,status:'dismissed' as const,dismissedAt:new Date().toISOString()}:p)};});}
 const current=await read(ownerId);return Response.json({scope:current.scope,proposal:servicePlan(current.state,id)},{headers});
}catch(error){return apiFailure(error,'runtime');}}
