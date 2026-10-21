import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {deferInline} from '@/lib/agentos/auth';
import {apiFailure} from '@/lib/agentos/api-failure';
import {canonical} from '@/cre/workflow/verify';
import {DomainError} from '@/lib/agentos/engine';
import {workflowPlanRequestSchema} from '@/lib/agentos/workflow-plan-schema';
import {normalizePlanParameters,findWorkflowProposal,generateWorkflowProposal,saveWorkflowProposal,acceptWorkflowProposal,dismissWorkflowProposal} from '@/lib/agentos/workflow-plans';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
import {configuredWorkflowCatalog} from '@/lib/agentos/workflow-plan-runtime';
import {workflowPlanningModel} from '@/lib/agentos/model-runtime';
import {workflowSupplierAccess} from '@/lib/agentos/workflow-supplier-runtime';
import {workflowPublisher,scheduleWorkflows} from '@/lib/agentos/workflow-runtime';
import {findWorkflow} from '@/lib/agentos/workflows';
import {checkInputSource} from '@/lib/agentos/data-runtime';

export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return Response.json({error:'Request too large.'},{status:413});const body=workflowPlanRequestSchema.parse(JSON.parse(raw)),snapshot=await read(ownerId);let result,planId:string,omitted=0,excluded:unknown[]=[];
 if(body.action==='propose'){
  const {action:_,...fields}=body,parameters=normalizePlanParameters(fields),prior=snapshot.state.workflowPlans?.find(p=>p.requestId===parameters.requestId);planId='plan-'+parameters.requestId;
  if(prior){if(canonical(prior.parameters)!==canonical(parameters))throw new DomainError('Workflow plan request ID was used with different parameters.','IDEMPOTENCY_CONFLICT');result=snapshot;}
  else{
   await checkInputSource(request,parameters.input);const configured=await configuredOrderChain(request),catalog=await configuredWorkflowCatalog(configured,snapshot.state,parameters,snapshot.scope),model=workflowPlanningModel(request);omitted=catalog.omitted;excluded=catalog.excluded;
   const proposal=await generateWorkflowProposal(snapshot.state,parameters,snapshot.scope,configured.deployment,catalog.choices,model.configuration,model.key),access=workflowSupplierAccess(configured,snapshot.scope),selected=proposal.program.steps.map(s=>proposal.selected.find(c=>c.key===proposal.catalog[s.choice].key)!);await access.checkSession(snapshot.state.vaultSessions!.find(s=>s.sessionId===parameters.vaultSessionId)!,selected.reduce((n,c)=>n+c.budget,0));result=await updateWorkspace(ownerId,state=>saveWorkflowProposal(state,proposal));
  }
 }else if(body.action==='dismiss'){
  planId=body.planId;result=await updateWorkspace(ownerId,state=>dismissWorkflowProposal(state,planId));
 }else{
  planId=body.planId;const configured=await configuredOrderChain(request),access=workflowSupplierAccess(configured,snapshot.scope);
  result=await updateWorkspace(ownerId,state=>acceptWorkflowProposal(state,planId,body.digest,configured.deployment,workflowPublisher(configured),access));
  if(!deferInline(request))scheduleWorkflows(ownerId,result.state,request);
 }
 const proposal=findWorkflowProposal(result.state,planId);return Response.json({...result,proposal,...(proposal.workflowId?{workflow:findWorkflow(result.state,proposal.workflowId)}:{}),omitted,excluded},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
export async function GET(request:Request){try{const {state,revision,scope}=await read(owner(request));return Response.json({plans:state.workflowPlans??[],revision,scope},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiFailure(error,'runtime');}}
