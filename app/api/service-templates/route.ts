import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {digest,DomainError} from '@/lib/agentos/engine';
import {canonical} from '@/cre/workflow/verify';
import {serviceTemplateRequestSchema,definitionFromServicePlan,saveServiceTemplate,archiveServiceTemplate,proposeServiceTemplate,serviceTemplate} from '@/lib/agentos/service-templates';
import {configuredServiceCatalog} from '@/lib/agentos/service-plan-runtime';
import {saveServiceProposal,servicePlan} from '@/lib/agentos/service-plans';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{const snapshot=await read(owner(request));return Response.json({scope:snapshot.scope,templates:snapshot.state.serviceTemplates??[]},{headers});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415,headers});const reader=request.body?.getReader();if(!reader)throw new DomainError('JSON required.');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>65536){await reader.cancel();return Response.json({error:'Request too large.'},{status:413,headers});}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=serviceTemplateRequestSchema.parse(JSON.parse(text)),snapshot=await read(ownerId);if(body.scope!==snapshot.scope)throw new DomainError('Service template belongs to another workspace.','FORBIDDEN');
 if(body.action==='instantiate'){
  const prior=snapshot.state.servicePlans?.find(p=>p.parameters.requestId===body.requestId);
  if(prior){if(prior.template?.id!==body.templateId||prior.template.digest!==body.digest||canonical(prior.parameters.input)!==canonical(body.input)||prior.parameters.totalBudget!==body.totalBudget||prior.parameters.perStepBudget!==body.perStepBudget)throw new DomainError('Template application identifier already has different terms.','IDEMPOTENCY_CONFLICT');return Response.json({scope:snapshot.scope,proposal:prior},{headers});}
  const catalog=await configuredServiceCatalog(request,ownerId,snapshot.state),proposal=await proposeServiceTemplate(snapshot.state,body,catalog.entries);
  const saved=await updateWorkspace(ownerId,async state=>{const current=serviceTemplate(state,body.templateId);if(current.archivedAt||current.digest!==body.digest)throw new DomainError('Template is archived or changed.','FORBIDDEN');return saveServiceProposal(state,proposal,snapshot.scope);});return Response.json({scope:saved.scope,proposal:servicePlan(saved.state,proposal.id)},{headers});
 }
 let result,id:string;if(body.action==='archive'||body.action==='restore'){id=body.templateId;result=await updateWorkspace(ownerId,state=>archiveServiceTemplate(state,id,body.digest,snapshot.scope,body.action==='archive'));}
 else{if(body.action==='import'&&await digest(body.definition)!==body.digest)throw new DomainError('Imported service template digest differs.','FORBIDDEN');id='service-template-'+body.requestId;result=await updateWorkspace(ownerId,async state=>saveServiceTemplate(state,body.requestId,body.action==='save'?await definitionFromServicePlan(state,body.planId,body):body.definition,snapshot.scope));}
 return Response.json({scope:result.scope,template:serviceTemplate(result.state,id)},{headers});
}catch(error){return apiFailure(error,'runtime');}}
