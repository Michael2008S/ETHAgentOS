import {z} from 'zod';

import {digest,DomainError} from './engine.ts';
import {serviceTemplateDefinitionSchema,validateServiceTemplate,verifyServiceTemplate,verifyTemplateApplication,type ServiceTemplate,type ServiceTemplateDefinition} from './service-template-protocol.ts';
import { verifyServiceProposal, servicePlan, type ServiceProposal } from './service-plans.ts';
import {servicePlanParametersSchema,compileServiceProgram} from './service-program.ts';
import type {ServiceDescriptor} from './service-catalog.ts';
import type {Workspace} from './types.ts';
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),id=z.string().regex(/^service-template-[0-9a-f-]{36}$/),uuid=z.string().uuid();
export const serviceTemplateRequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),scope:hash,requestId:uuid,planId:z.string().min(1).max(100),name:z.string().trim().min(3).max(120),description:z.string().trim().max(500).default(''),revision:z.string().min(5).max(14)}).strict(),
 z.object({action:z.literal('import'),scope:hash,requestId:uuid,definition:serviceTemplateDefinitionSchema,digest:hash}).strict(),
 z.object({action:z.literal('archive'),scope:hash,templateId:id,digest:hash}).strict(),z.object({action:z.literal('restore'),scope:hash,templateId:id,digest:hash}).strict(),
 z.object({action:z.literal('instantiate'),scope:hash,requestId:uuid,templateId:id,digest:hash,input:servicePlanParametersSchema.shape.input,totalBudget:servicePlanParametersSchema.shape.totalBudget,perStepBudget:servicePlanParametersSchema.shape.perStepBudget}).strict(),
]);
export function serviceTemplate(state:Workspace,id:string){const t=state.serviceTemplates?.find(t=>t.id===id);if(!t)throw new DomainError('Service template not found.','NOT_FOUND');return t;}
export function definitionFromServicePlan(state:Workspace,planId:string,metadata:Pick<ServiceTemplateDefinition,'name'|'description'|'revision'>){return definitionFromServiceProposal(servicePlan(state,planId),metadata);}
export async function definitionFromServiceProposal(p:ServiceProposal,metadata:Pick<ServiceTemplateDefinition,'name'|'description'|'revision'>){
 await verifyServiceProposal(p);const ids=[...new Set(p.program.steps.map(s=>s.serviceId))];
 return validateServiceTemplate({protocol:'agentos.service-template.v1',name:metadata.name,description:metadata.description,revision:metadata.revision,program:p.program,limits:{totalBudget:p.parameters.totalBudget,perStepBudget:p.parameters.perStepBudget,timeoutSeconds:p.parameters.timeoutSeconds},services:ids.map(id=>{const s=p.catalog.find(c=>c.id===id)!;if(s.input.protocol!=='json.v1'||s.output.protocol!=='json.v1')throw new DomainError('Template requires the JSON service execution adapter.');return {id,manifestHash:s.binding.manifestHash,input:s.input.schema,output:s.output.schema,maxPriceCents:Math.max(...p.draft.steps.filter(step=>step.pluginId===id).map(step=>step.maxPriceCents))};})});
}
export async function saveServiceTemplate(state:Workspace,requestId:string,raw:unknown,scope:string,now=new Date().toISOString()){
 uuid.parse(requestId);const definition=validateServiceTemplate(raw),fingerprint=await digest(definition),prior=state.serviceTemplates?.find(t=>t.requestId===requestId);if(prior){if(prior.scope!==scope||prior.digest!==fingerprint)throw new DomainError('Service template identifier already has different terms.','IDEMPOTENCY_CONFLICT');return state;}
 if((state.serviceTemplates?.length??0)>=100)throw new DomainError('Service template history is full.');if(state.serviceTemplates?.some(t=>t.definition.name===definition.name&&t.definition.revision===definition.revision&&t.digest!==fingerprint))throw new DomainError('Template name and revision are immutable. Choose a new revision.','CONFLICT');
 const record:ServiceTemplate={id:'service-template-'+requestId,requestId,scope,definition,digest:fingerprint,createdAt:now};return {...state,serviceTemplates:[record,...state.serviceTemplates??[]]};
}
export async function archiveServiceTemplate(state:Workspace,id:string,digest:string,scope:string,archive:boolean,now=new Date().toISOString()){
 const record=serviceTemplate(state,id);await verifyServiceTemplate(record);if(record.scope!==scope||record.digest!==digest)throw new DomainError('Service template belongs to another scope or digest.','FORBIDDEN');return {...state,serviceTemplates:state.serviceTemplates!.map(t=>{if(t.id!==id)return t;const next={...t};if(archive)next.archivedAt=now;else delete next.archivedAt;return next;})};
}
export async function proposeServiceTemplate(state:Workspace,request:Extract<z.infer<typeof serviceTemplateRequestSchema>,{action:'instantiate'}>,catalog:ServiceDescriptor[],now=new Date().toISOString()):Promise<ServiceProposal>{
 const record=serviceTemplate(state,request.templateId);await verifyServiceTemplate(record);if(!state.policy.active||record.scope!==request.scope||record.digest!==request.digest||record.archivedAt)throw new DomainError('An active reviewed service template in this workspace is required.','FORBIDDEN');
 const d=record.definition,parameters=servicePlanParametersSchema.parse({requestId:request.requestId,goal:d.name,input:request.input,totalBudget:request.totalBudget,perStepBudget:request.perStepBudget,maxSteps:d.program.steps.length,timeoutSeconds:d.limits.timeoutSeconds}),selected=catalog.filter(s=>d.services.some(slot=>slot.id===s.id)),template={id:record.id,digest:record.digest,definition:structuredClone(d)};
 await verifyTemplateApplication(template,parameters,selected,d.program);const draft=compileServiceProgram(d.program,parameters,selected),terms={version:'agentos.service-plan.v1' as const,id:'service-plan-'+parameters.requestId,scope:request.scope,parameters,catalog:structuredClone(selected),program:structuredClone(d.program),draft,template,generatedAt:now,expiresAt:new Date(Date.parse(now)+300000).toISOString()};
 if(draft.steps.some(s=>s.maxPriceCents>state.policy.maxTaskBudget))throw new DomainError('Template exceeds the current per-task policy.','FORBIDDEN');
 return {...terms,digest:await digest(terms),status:'proposed'};
}
