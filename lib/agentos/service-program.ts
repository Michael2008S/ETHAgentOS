import {z} from 'zod';
import {DomainError} from './engine.ts';
import {boundedJson,type Json} from './plugin-protocol.ts';
import {pluginPurchaseInputSchema,selectPluginPurchaseInput,type PluginPurchaseDraft} from './plugin-purchase-protocol.ts';
import {checkServiceInput,type ServiceDescriptor} from './service-catalog.ts';
const cents=z.number().int().positive().max(1000000);
export const servicePlanParametersSchema=z.object({requestId:z.string().uuid(),goal:z.string().trim().min(3).max(500),input:z.custom<Json>(v=>{try{boundedJson(v);return true;}catch{return false;}},'Invalid bounded JSON input.'),totalBudget:cents,perStepBudget:cents,maxSteps:z.number().int().min(1).max(8).default(4),timeoutSeconds:z.number().int().min(60).max(3600).default(600)}).strict();
export type ServicePlanParameters=z.infer<typeof servicePlanParametersSchema>;
const step=z.object({serviceId:z.string().min(1).max(200),input:pluginPurchaseInputSchema}).strict();
export const serviceProgramSchema=z.object({status:z.enum(['planned','unsupported']),steps:z.array(step).max(8)}).strict();
export type ServiceProgram=z.infer<typeof serviceProgramSchema>;
export type ServicePlanDraft=Omit<PluginPurchaseDraft,'buyer'|'vaultSessionId'>;
export function compileServiceProgram(raw:unknown,parameters:ServicePlanParameters,catalog:ServiceDescriptor[]):ServicePlanDraft{
 const program=serviceProgramSchema.parse(raw);if(program.status!=='planned'||!program.steps.length||program.steps.length>parameters.maxSteps)throw new DomainError('The goal is unsupported or exceeds its reviewed step limit.','MODEL_REJECTED');
 const selected:ServiceDescriptor[]=[],steps:PluginPurchaseDraft['steps']=[];
 for(const [index,step]of program.steps.entries()){
  const service=catalog.find(c=>c.id===step.serviceId);if(!service||service.executor!=='plugin'||service.priceKind!=='fixed'||service.priceCents>parameters.perStepBudget)throw new DomainError('Model selected an unavailable service or incompatible execution adapter.','MODEL_REJECTED');
  if(step.input.from==='root')checkServiceInput(service,selectPluginPurchaseInput(parameters.input,step.input,new Map()));
  else{if(step.input.step>=index)throw new DomainError('Service input must reference an earlier paid step.','MODEL_REJECTED');checkServiceInput(service,{source:selected[step.input.step],path:step.input.path},true);}
  selected.push(service);const binding=service.binding;steps.push({pluginId:binding.pluginId!,manifestHash:binding.manifestHash!,runtimeHash:binding.runtimeHash!,maxPriceCents:service.priceCents,input:step.input});
 }
 if(selected.reduce((n,s)=>n+s.priceCents,0)>parameters.totalBudget)throw new DomainError('Service plan exceeds the reviewed total budget.','FORBIDDEN');
 return {requestId:parameters.requestId,title:parameters.goal.slice(0,120).trim(),input:structuredClone(parameters.input),steps,totalBudget:parameters.totalBudget,timeoutSeconds:parameters.timeoutSeconds};
}
