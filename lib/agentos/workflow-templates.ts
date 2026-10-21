import {z} from 'zod';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError,skillCatalog} from './engine.ts';
import type {Workspace} from './types.ts';
import {skillIdSchema} from './skill-schema.ts';
import {skillDefinitionHash} from './skill-definition.ts';
import {portableWorkflowInputSchema,workflowStepDraftSchema,workflowConditionSchema} from './workflow-schema.ts';
import {validateWorkflowCondition} from './workflow-constraints.ts';
import type {WorkflowStepDraft} from './workflow-state.ts';

const hash=z.string().regex(/^0x[0-9a-f]{64}$/),name=z.string().trim().min(1).max(120),revision=z.string().regex(/^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/),timeout=z.number().int().min(30).max(86400),id=z.string().regex(/^template-[0-9a-fA-F-]{36}$/);
const slot=z.object({skill:skillIdSchema,skillVersion:revision,skillHash:hash.optional(),budget:z.number().int().positive().max(1000000),input:portableWorkflowInputSchema,when:workflowConditionSchema.optional(),executor:z.enum(['builtin','supplier'])}).strict();
export const workflowTemplateDefinitionSchema=z.object({protocol:z.literal('agentos.workflow-template.v1'),name,description:z.string().trim().max(500),revision,timeoutSeconds:timeout,steps:z.array(slot).min(2).max(8)}).strict();
export type WorkflowTemplateDefinition=z.infer<typeof workflowTemplateDefinitionSchema>;
export type WorkflowTemplate={id:string;requestId:string;workspaceHash:string;definition:WorkflowTemplateDefinition;digest:string;createdAt:string;archivedAt?:string};
export const templateBindingSchema=z.object({agentId:z.string().min(1).max(128),supplierId:z.string().regex(/^[a-z0-9-]{1,64}$/).optional()}).strict();
export type TemplateBinding=z.infer<typeof templateBindingSchema>;
export const workflowTemplateRequestSchema=z.union([
 z.object({action:z.literal('save'),requestId:z.string().uuid(),name,description:z.string().trim().max(500).default(''),revision,timeoutSeconds:timeout,steps:z.array(workflowStepDraftSchema).min(2).max(8)}).strict(),
 z.object({action:z.literal('import'),requestId:z.string().uuid(),definition:workflowTemplateDefinitionSchema,digest:hash}).strict(),
 z.object({action:z.literal('archive'),templateId:id,digest:hash}).strict(),
 z.object({action:z.literal('restore'),templateId:id,digest:hash}).strict(),
 z.object({action:z.literal('instantiate'),templateId:id,digest:hash,bindings:z.array(templateBindingSchema).min(2).max(8)}).strict(),
]);
export function validateTemplateDefinition(raw:unknown){
 const parsed=workflowTemplateDefinitionSchema.safeParse(raw);if(!parsed.success)throw new DomainError('Invalid workflow template definition.');const definition=parsed.data;
 for(const [index,step] of definition.steps.entries()){
  if(step.skill.startsWith('ext:')!==Boolean(step.skillHash))throw new DomainError('Template extension slots require their exact installed definition hash.');
  if(step.skill.startsWith('ext:')&&!step.skill.endsWith('@'+step.skillVersion))throw new DomainError('Template skill version differs from its identifier.');
  if(step.input.from==='step'&&step.input.step>=index)throw new DomainError('Template input must reference an earlier step.');
  if(step.when)validateWorkflowCondition(step.when,definition.steps.map(s=>s.skill),index);
 }
 return definition;
}
/** Portable definitions contain only skill requirements and program structure, never input or authority. */
export function definitionFromWorkflow(state:Workspace,metadata:Pick<WorkflowTemplateDefinition,'name'|'description'|'revision'|'timeoutSeconds'>,steps:WorkflowStepDraft[]){
 return validateTemplateDefinition({protocol:'agentos.workflow-template.v1',name:metadata.name,description:metadata.description,revision:metadata.revision,timeoutSeconds:metadata.timeoutSeconds,steps:steps.map(step=>{
  const service=state.agents.find(a=>a.id===step.agentId),skill=skillCatalog(state).find(s=>s.id===service?.skill);if(!service||!skill)throw new DomainError('Template service or installed skill is unavailable.');
  const installed=state.skillDefinitions?.find(s=>s.id===service.skill);
  return {skill:service.skill,skillVersion:skill.version,...(installed?{skillHash:skillDefinitionHash(installed)}:{}),budget:step.budget,input:step.input,...(step.when?{when:step.when}:{}),executor:step.supplierId?'supplier':'builtin'};
 })});
}
export async function verifyWorkflowTemplate(record:WorkflowTemplate){
 const parsed=validateTemplateDefinition(record.definition);
 if(record.id!=='template-'+record.requestId||canonical(parsed)!==canonical(record.definition)||await digest(record.definition)!==record.digest)throw new DomainError('Workflow template differs from its reviewed digest.','FORBIDDEN');
}
export async function saveWorkflowTemplate(state:Workspace,requestId:string,raw:unknown,scope:string,now=new Date().toISOString()){
 if(!z.string().uuid().safeParse(requestId).success)throw new DomainError('Invalid template request ID.');const definition=validateTemplateDefinition(raw),fingerprint=await digest(definition),prior=state.workflowTemplates?.find(t=>t.requestId===requestId);
 if(prior){if(prior.workspaceHash!==scope||prior.digest!==fingerprint)throw new DomainError('Template request ID was used with different terms.','IDEMPOTENCY_CONFLICT');return state;}
 if((state.workflowTemplates?.length??0)>=100)throw new DomainError('Workspace template history is full.');
 if(state.workflowTemplates?.some(t=>t.definition.name===definition.name&&t.definition.revision===definition.revision&&t.digest!==fingerprint))throw new DomainError('Template name and revision are immutable. Choose a new revision.','CONFLICT');
 const record:WorkflowTemplate={id:'template-'+requestId,requestId,workspaceHash:scope,definition,digest:fingerprint,createdAt:now};return {...state,workflowTemplates:[record,...state.workflowTemplates??[]]};
}
export function findWorkflowTemplate(state:Workspace,id:string){const record=state.workflowTemplates?.find(t=>t.id===id);if(!record)throw new DomainError('Workflow template not found.','NOT_FOUND');return record;}
export async function setWorkflowTemplateArchived(state:Workspace,id:string,reviewDigest:string,scope:string,archive:boolean,now=new Date().toISOString()){
 const record=findWorkflowTemplate(state,id);await verifyWorkflowTemplate(record);if(record.workspaceHash!==scope||record.digest!==reviewDigest)throw new DomainError('Workflow template differs from its reviewed digest.','FORBIDDEN');
 if(Boolean(record.archivedAt)===archive)return state;const next=structuredClone(state),target=findWorkflowTemplate(next,id);if(archive)target.archivedAt=now;else delete target.archivedAt;return next;
}
export async function instantiateWorkflowTemplate(state:Workspace,id:string,reviewDigest:string,scope:string,rawBindings:TemplateBinding[]){
 const record=findWorkflowTemplate(state,id);await verifyWorkflowTemplate(record);if(record.workspaceHash!==scope||record.digest!==reviewDigest)throw new DomainError('Workflow template differs from its reviewed digest.','FORBIDDEN');if(record.archivedAt)throw new DomainError('Restore the archived template before reuse.');
 const parsed=z.array(templateBindingSchema).safeParse(rawBindings);if(!parsed.success||parsed.data.length!==record.definition.steps.length)throw new DomainError('Select a service for every template slot.');
 if(!state.policy.active)throw new DomainError('Execution permission has been revoked.','FORBIDDEN');
 const steps:WorkflowStepDraft[]=record.definition.steps.map((slot,index)=>{
  const binding=parsed.data[index],agent=state.agents.find(a=>a.id===binding.agentId),definition=state.skillDefinitions?.find(s=>s.id===slot.skill);
  if(!agent?.enabled||agent.skill!==slot.skill||!state.policy.allowedSkills.includes(slot.skill)||slot.budget>state.policy.maxTaskBudget||slot.executor==='builtin'&&agent.price>slot.budget)throw new DomainError('Template service, skill or fee ceiling is unavailable under the current policy.','FORBIDDEN');
  if(slot.skillHash!==(definition?skillDefinitionHash(definition):undefined)||skillCatalog(state).find(s=>s.id===slot.skill)?.version!==slot.skillVersion)throw new DomainError('Install the exact template skill definition before reuse.','FORBIDDEN');
  if(slot.executor==='supplier'?!binding.supplierId:Boolean(binding.supplierId))throw new DomainError('Template execution provider differs from its reviewed slot.');
  return {agentId:agent.id,budget:slot.budget,input:slot.input,...(slot.when?{when:slot.when}:{}),...(binding.supplierId?{supplierId:binding.supplierId}:{})};
 });
 // This is an editable draft, not a quote, a session grant or an execution checkpoint.
 return structuredClone({title:record.definition.name,timeoutSeconds:record.definition.timeoutSeconds,steps,...(steps.some(s=>s.supplierId)?{supplierPricing:'signed-at-execution-under-cap' as const}:{}),templateDigest:record.digest});
}
