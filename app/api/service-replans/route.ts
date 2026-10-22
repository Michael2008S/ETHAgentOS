import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {DomainError} from '@/lib/agentos/engine';
import {canonical} from '@/cre/workflow/verify';
import {pluginDatabase} from '@/lib/agentos/plugin-runtime';
import {configuredPluginPurchaseRuntime} from '@/lib/agentos/plugin-purchase-runtime';
import {serviceReplanRequestSchema,buildServiceReplan} from '@/lib/agentos/service-replan';
import {configuredServiceCatalog} from '@/lib/agentos/service-plan-runtime';
import {generateServiceProposal,saveServiceProposal,servicePlan} from '@/lib/agentos/service-plans';
import {workflowPlanningModel} from '@/lib/agentos/model-runtime';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415,headers});const reader=request.body?.getReader();if(!reader)throw new DomainError('JSON required.');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>65536){await reader.cancel();return Response.json({error:'Request too large.'},{status:413,headers});}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=serviceReplanRequestSchema.parse(JSON.parse(text)),snapshot=await read(ownerId);if(body.scope!==snapshot.scope)throw new DomainError('Plugin repair belongs to another workspace.','FORBIDDEN');
 if(body.action==='propose'){
  const prior=snapshot.state.servicePlans?.find(p=>p.parameters.requestId===body.parameters.requestId);
  if(prior){const {input:_,...parameters}=prior.parameters,r=prior.replan;if(!r||prior.template||canonical(parameters)!==canonical(body.parameters)||r.sourceWorkflowId!==body.sourceWorkflowId||r.buyer.toLowerCase()!==body.buyer.toLowerCase()||r.goalBudget!==body.goalBudget||canonical(r.root?{workflowId:r.root.workflowId,step:r.root.step}:null)!==canonical(body.root))throw new DomainError('Repair request identifier already has different terms.','IDEMPOTENCY_CONFLICT');return Response.json({scope:snapshot.scope,proposal:prior},{headers});}
 }
 const runtime=await configuredPluginPurchaseRuntime(request),context=await buildServiceReplan(pluginDatabase(),ownerId,body.sourceWorkflowId,body.buyer,body.goalBudget,body.root,runtime.chain);
 if(body.action==='inspect')return Response.json({scope:snapshot.scope,context},{headers});
 const catalog=await configuredServiceCatalog(request,ownerId,snapshot.state),model=workflowPlanningModel(request),proposal=await generateServiceProposal(snapshot.state,{...body.parameters,input:context.input},snapshot.scope,catalog.entries,model.configuration,model.key,undefined,undefined,context.replan);
 const saved=await updateWorkspace(ownerId,async state=>{const current=await buildServiceReplan(pluginDatabase(),ownerId,body.sourceWorkflowId,body.buyer,body.goalBudget,body.root,runtime.chain);if(canonical(current.replan)!==canonical(context.replan))throw new DomainError('Repair source changed during planning.','CONFLICT');return saveServiceProposal(state,proposal,snapshot.scope);});return Response.json({scope:saved.scope,proposal:servicePlan(saved.state,proposal.id)},{headers});
}catch(error){return apiFailure(error,'runtime');}}
