import {z} from 'zod';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {validatePluginSchema,type PluginSchema} from './plugin-protocol.ts';
import {schemaAssignable,schemaAtPath,type ServiceDescriptor} from './service-catalog.ts';
import {serviceProgramSchema,type ServiceProgram,type ServicePlanParameters} from './service-program.ts';
const hash=z.string().regex(/^0x[0-9a-f]{64}$/),cents=z.number().int().positive().max(1000000),schema=z.custom<PluginSchema>(v=>{try{validatePluginSchema(v);return true;}catch{return false;}},'Invalid service template schema.');
export const serviceTemplateDefinitionSchema=z.object({protocol:z.literal('agentos.service-template.v1'),name:z.string().trim().min(3).max(120),description:z.string().trim().max(500),revision:z.string().regex(/^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/),services:z.array(z.object({id:z.string().regex(/^plugin:[a-z][a-z0-9.-]{2,62}@[0-9]+\.[0-9]+\.[0-9]+$/),manifestHash:hash,input:schema,output:schema,maxPriceCents:cents}).strict()).min(1).max(8),program:serviceProgramSchema,limits:z.object({totalBudget:cents,perStepBudget:cents,timeoutSeconds:z.number().int().min(60).max(3600)}).strict()}).strict();
export type ServiceTemplateDefinition=z.infer<typeof serviceTemplateDefinitionSchema>;
export type ServiceTemplate={id:string;requestId:string;scope:string;definition:ServiceTemplateDefinition;digest:string;createdAt:string;archivedAt?:string};
export type ServiceTemplateSource=Pick<ServiceTemplate,'id'|'digest'|'definition'>;
export function validateServiceTemplate(raw:unknown){
 const d=serviceTemplateDefinitionSchema.parse(raw);if(new TextEncoder().encode(JSON.stringify(d)).length>49152||d.program.status!=='planned'||!d.program.steps.length||new Set(d.services.map(s=>s.id)).size!==d.services.length||d.services.some(s=>!d.program.steps.some(p=>p.serviceId===s.id)))throw new DomainError('Invalid bounded service template.');
 for(const [i,step]of d.program.steps.entries()){
  const target=d.services.find(s=>s.id===step.serviceId);if(!target||target.maxPriceCents>d.limits.perStepBudget)throw new DomainError('Template service or fee ceiling is unavailable.');
  if(step.input.from==='step'){const from=step.input.step,source=d.services.find(s=>s.id===d.program.steps[from]?.serviceId);if(from>=i||!source||!schemaAssignable(schemaAtPath(source.output,step.input.path),target.input))throw new DomainError('Template must use compatible earlier paid inputs.');}
 }
 if(d.program.steps.reduce((n,step)=>n+d.services.find(s=>s.id===step.serviceId)!.maxPriceCents,0)>d.limits.totalBudget)throw new DomainError('Template fee ceilings exceed its total budget.');
 return d;
}
export async function verifyServiceTemplate(record:ServiceTemplate){
 const d=validateServiceTemplate(record.definition);if(!z.string().uuid().safeParse(record.requestId).success||record.id!=='service-template-'+record.requestId||!hash.safeParse(record.scope).success||canonical(d)!==canonical(record.definition)||await digest(d)!==record.digest)throw new DomainError('Service template differs from its reviewed digest.','FORBIDDEN');
}
export async function verifyTemplateApplication(source:ServiceTemplateSource,parameters:ServicePlanParameters,catalog:ServiceDescriptor[],program:ServiceProgram){
 const d=validateServiceTemplate(source.definition);if(!/^service-template-[0-9a-f-]{36}$/.test(source.id)||await digest(d)!==source.digest||canonical(d.program)!==canonical(program)||parameters.goal!==d.name||parameters.maxSteps!==d.program.steps.length||parameters.totalBudget>d.limits.totalBudget||parameters.perStepBudget>d.limits.perStepBudget||parameters.timeoutSeconds!==d.limits.timeoutSeconds)throw new DomainError('Applied service template differs from its reviewed definition.','FORBIDDEN');
 for(const slot of d.services){const current=catalog.find(s=>s.id===slot.id);if(!current||current.executor!=='plugin'||current.binding.manifestHash!==slot.manifestHash||current.priceCents>slot.maxPriceCents||current.input.protocol!=='json.v1'||current.output.protocol!=='json.v1'||canonical(current.input.schema)!==canonical(slot.input)||canonical(current.output.schema)!==canonical(slot.output))throw new DomainError('Install the exact template plugin code and compatible current fee before reuse.','FORBIDDEN');}
 if(catalog.length!==d.services.length||new Set(catalog.map(s=>s.id)).size!==d.services.length)throw new DomainError('Applied service template has an unrelated catalog entry.','FORBIDDEN');
}
