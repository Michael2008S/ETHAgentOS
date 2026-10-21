import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {apiFailure} from '@/lib/agentos/api-failure';
import {digest,DomainError} from '@/lib/agentos/engine';
import {workflowTemplateRequestSchema,definitionFromWorkflow,saveWorkflowTemplate,setWorkflowTemplateArchived,instantiateWorkflowTemplate,findWorkflowTemplate} from '@/lib/agentos/workflow-templates';

export async function GET(request:Request){try{const {state,revision,scope}=await read(owner(request));return Response.json({templates:state.workflowTemplates??[],revision,scope},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return apiFailure(error,'runtime');}}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 // Bound streaming reads before allocating a complete body; no remote/tool execution occurs here.
 const reader=request.body?.getReader();if(!reader)throw new DomainError('Invalid workflow template request.');let size=0,text='';const decoder=new TextDecoder();try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>65536){await reader.cancel();return Response.json({error:'Request too large.'},{status:413});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 const body=workflowTemplateRequestSchema.parse(JSON.parse(text)),snapshot=await read(ownerId);
 if(body.action==='instantiate'){const draft=await instantiateWorkflowTemplate(snapshot.state,body.templateId,body.digest,snapshot.scope,body.bindings);return Response.json({draft,scope:snapshot.scope},{headers:{'Cache-Control':'no-store'}});}
 if(body.action==='archive'||body.action==='restore'){const result=await updateWorkspace(ownerId,state=>setWorkflowTemplateArchived(state,body.templateId,body.digest,snapshot.scope,body.action==='archive'));return Response.json({template:findWorkflowTemplate(result.state,body.templateId),scope:result.scope},{headers:{'Cache-Control':'no-store'}});}
 if(body.action==='import'&&await digest(body.definition)!==body.digest)throw new DomainError('Workflow template differs from its reviewed digest.','FORBIDDEN');
 const result=await updateWorkspace(ownerId,state=>saveWorkflowTemplate(state,body.requestId,body.action==='save'?definitionFromWorkflow(state,body,body.steps):body.definition,snapshot.scope));return Response.json({template:findWorkflowTemplate(result.state,'template-'+body.requestId),scope:result.scope},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
