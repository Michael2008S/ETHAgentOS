import {omitFields} from '../../../lib/agentos/omit-fields.ts';
import {z} from 'zod';
import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {repairPolicyInputSchema,createRepairPolicy,setRepairPolicy,findRepairPolicy} from '@/lib/agentos/workflow-repair-policy';
import {configuredRepairRuntime} from '@/lib/agentos/workflow-repair-runtime';
import {modelDescriptor} from '@/lib/agentos/model';
import {planSession,normalizePlanParameters} from '@/lib/agentos/workflow-plans';
import {checkVaultBinding} from '@/lib/agentos/vault';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
const schema=z.union([repairPolicyInputSchema.extend({action:z.literal('configure')}),z.object({action:z.enum(['cancel','resume']),policyId:z.string().min(1).max(128),digest:z.string().regex(/^0x[0-9a-f]{64}$/)}).strict()]);
export async function GET(request:Request){try{const {state,revision,scope}=await read(owner(request));return Response.json({policies:state.workflowRepairPolicies??[],revision,scope},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});const reader=request.body?.getReader();if(!reader)return Response.json({error:'JSON required.'},{status:400});let size=0,text='';const decoder=new TextDecoder();try{for(;;){const r=await reader.read();if(r.done)break;if((size+=r.value.length)>65536){await reader.cancel();return Response.json({error:'Request too large.'},{status:413});}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=schema.parse(JSON.parse(text)),snapshot=await read(ownerId);let result,policyId:string;
 if(body.action==='configure'){
  const input=omitFields(body,"action");policyId='repair-'+input.requestId;const prior=snapshot.state.workflowRepairPolicies?.find(p=>p.id===policyId);
  if(prior){result=await updateWorkspace(ownerId,state=>createRepairPolicy(state,input,snapshot.scope,prior.deployment,prior.model));}
  else{const runtime=await configuredRepairRuntime(request,snapshot.scope),configured=await configuredOrderChain(request),session=snapshot.state.vaultSessions?.find(s=>s.sessionId===input.vaultSessionId);if(session)await checkVaultBinding(configured.client,runtime.deployment,session);const descriptor=await modelDescriptor(runtime.model.configuration);result=await updateWorkspace(ownerId,state=>createRepairPolicy(state,input,snapshot.scope,runtime.deployment,descriptor));}
 }else{
  policyId=body.policyId;if(body.action==='resume'){const p=findRepairPolicy(snapshot.state,policyId),runtime=await configuredRepairRuntime(request,snapshot.scope),source=snapshot.state.workflows?.find(w=>w.id===p.activeWorkflowId);if(source){const parameters=normalizePlanParameters({requestId:p.requestId,goal:p.parameters.goal,buyer:p.parameters.buyer,vaultSessionId:p.parameters.vaultSessionId,input:source.input,totalBudget:p.parameters.planBudget,perStepBudget:p.parameters.perStepBudget,maxSteps:p.parameters.maxSteps,execution:p.parameters.execution,allowConditions:p.parameters.allowConditions,timeoutSeconds:300},true);planSession(snapshot.state,parameters);await runtime.checkSession(snapshot.state,parameters,0);}}
  result=await updateWorkspace(ownerId,state=>setRepairPolicy(state,policyId,body.digest,body.action));
 }
 return Response.json({policy:findRepairPolicy(result.state,policyId),scope:result.scope},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
