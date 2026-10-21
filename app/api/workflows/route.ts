import {z} from 'zod';
import {owner,checkOrigin,read,updateWorkspace} from '@/lib/agentos/store';
import {DomainError} from '@/lib/agentos/engine';
import {checkInputSource} from '@/lib/agentos/data-runtime';
import {configuredOrderChain} from '@/lib/agentos/order-runtime';
import {checkVaultBinding} from '@/lib/agentos/vault';
import {createWorkflow,controlWorkflow,findWorkflow} from '@/lib/agentos/workflows';
import {scheduleWorkflows,workflowPublisher} from '@/lib/agentos/workflow-runtime';
import {deferInline} from '@/lib/agentos/auth';
import {transferSourceSchema} from '@/lib/agentos/transfer-source';
const id=z.string().min(1).max(128),integer=z.number().int().nonnegative().safe();
const input=z.object({dataset:z.enum(['eth-shenzhen-fixture-v1','custom-transfers-v1']),blockFrom:integer,blockTo:integer,source:transferSourceSchema.optional(),records:z.array(z.object({block:integer,from:z.string().min(1).max(128),to:z.string().min(1).max(128),cents:integer}).strict()).min(1).max(100).optional()}).strict();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),requestId:z.string().uuid(),title:z.string().trim().min(1).max(120),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),vaultSessionId:z.string().uuid(),agentIds:z.tuple([id,id]),budgets:z.tuple([integer.positive().max(1000000),integer.positive().max(1000000)]),input:input.optional(),timeoutSeconds:z.number().int().min(30).max(86400).default(300)}).strict(),
 z.object({action:z.enum(['resume','cancel']),workflowId:id}).strict(),
]);
function failure(error:unknown){const status=error instanceof DomainError?({UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,CONFLICT:409,IDEMPOTENCY_CONFLICT:409,UNAVAILABLE:503}[error.code]??400):error instanceof z.ZodError||error instanceof SyntaxError?400:503;return Response.json({error:error instanceof DomainError?error.message:error instanceof z.ZodError||error instanceof SyntaxError?'Invalid workflow request.':'Workflow service is unavailable. Checkpoint retained.'},{status,headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){try{
 checkOrigin(request);const ownerId=owner(request);
 if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
 const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return Response.json({error:'Request too large.'},{status:413});
 const body=schema.parse(JSON.parse(raw));
 let result,workflowId:string;
 if(body.action==='create'){
  const {action:_,...draft}=body,configured=await configuredOrderChain(request),snapshot=await read(ownerId),prior=snapshot.state.workflows?.find(w=>w.requestId===draft.requestId);
  if(!prior){await checkInputSource(request,draft.input);const session=snapshot.state.vaultSessions?.find(s=>s.sessionId===draft.vaultSessionId);if(!session?.signature||session.revokedAt)throw new DomainError('An active owner Vault session is required.','FORBIDDEN');await checkVaultBinding(configured.client,configured.deployment,session);}
  result=await updateWorkspace(ownerId,state=>createWorkflow(state,{...draft,buyer:draft.buyer as `0x${string}`},configured.deployment,workflowPublisher(configured)));workflowId='workflow-'+draft.requestId;
 }else{workflowId=body.workflowId;result=await updateWorkspace(ownerId,state=>controlWorkflow(state,workflowId,body.action));}
 if(!deferInline(request))scheduleWorkflows(ownerId,result.state,request);
 return Response.json({...result,workflow:findWorkflow(result.state,workflowId)},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function GET(request:Request){try{const {state,revision}=await read(owner(request)),id=new URL(request.url).searchParams.get('id');return Response.json(id?{workflow:findWorkflow(state,id),revision}:{workflows:state.workflows??[],revision},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
