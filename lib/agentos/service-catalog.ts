import { isArchived } from './business-archives.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {validatePluginSchema,validatePluginValue,type Json,type PluginSchema,type PluginRuntimeDescriptor} from './plugin-protocol.ts';
import {pluginToolsAvailable,type InstalledPlugin} from './plugin-state.ts';
import type {Agent,Workspace} from './types.ts';

export type ServiceContract={protocol:'transfers.v1'|'allocation-report.v1'|'event-summary.v1'|'ranked-flows.v1'}|{protocol:'json.v1';schema:PluginSchema};
export type ServiceTerms={protocol:'agentos.service.v1';id:string;name:string;description:string;executor:'builtin'|'supplier'|'plugin';revision:string;input:ServiceContract;output:ServiceContract;priceCents:number;priceKind:'fixed'|'ceiling';permissions:string[];binding:{agentId?:string;skill?:string;supplierId?:string;pluginId?:string;manifestHash?:string;runtimeHash?:string}};
export type ServiceDescriptor=ServiceTerms&{digest:string};
export const serviceTerms=({digest:_,...terms}:ServiceDescriptor)=>terms;
export const describeService=async(terms:ServiceTerms):Promise<ServiceDescriptor>=>({...terms,digest:await digest(terms)});
export async function verifyService(service:ServiceDescriptor){
 if(!service||service.protocol!=='agentos.service.v1'||!['builtin','supplier','plugin'].includes(service.executor)||!service.id||service.id.length>200||!Number.isSafeInteger(service.priceCents)||service.priceCents<1||service.priceCents>1000000||!['fixed','ceiling'].includes(service.priceKind)||!Array.isArray(service.permissions)||service.permissions.length>10||await digest(serviceTerms(service))!==service.digest)throw new DomainError('Service descriptor commitment differs.','FORBIDDEN');
 for(const contract of [service.input,service.output]){if(contract.protocol==='json.v1')validatePluginSchema(contract.schema);else if(!['transfers.v1','allocation-report.v1','event-summary.v1','ranked-flows.v1'].includes(contract.protocol))throw new DomainError('Unsupported service data contract.','FORBIDDEN');}
 if(service.executor==='plugin'&&(!service.binding.pluginId||!service.binding.manifestHash||!service.binding.runtimeHash||service.input.protocol!=='json.v1'||service.output.protocol!=='json.v1'))throw new DomainError('Plugin service is missing its exact runtime or schema.','FORBIDDEN');
}
export async function skillService(agent:Agent,options:{supplierId?:string;priceCents?:number;revision?:string}={}):Promise<ServiceDescriptor>{
 const supplier=options.supplierId;return describeService({protocol:'agentos.service.v1',id:agent.id+(supplier?':supplier:'+supplier:':builtin'),name:agent.name,description:agent.description,executor:supplier?'supplier':'builtin',revision:options.revision??'1.0.0',input:{protocol:'transfers.v1'},output:{protocol:agent.skill==='treasury-report'?'allocation-report.v1':agent.skill==='event-analysis'?'event-summary.v1':'ranked-flows.v1'},priceCents:options.priceCents??agent.price,priceKind:supplier?'ceiling':'fixed',permissions:['dataset.read','artifact.write'],binding:{agentId:agent.id,skill:agent.skill,...(supplier?{supplierId:supplier}:{})}});
}
export async function pluginService(installed:InstalledPlugin,runtime:PluginRuntimeDescriptor,priceCents:number):Promise<ServiceDescriptor>{
 pluginToolsAvailable(installed.manifest,runtime);const m=installed.manifest;return describeService({protocol:'agentos.service.v1',id:m.id,name:m.name,description:m.description,executor:'plugin',revision:m.id.split('@')[1],input:{protocol:'json.v1',schema:structuredClone(m.input)},output:{protocol:'json.v1',schema:structuredClone(m.output)},priceCents,priceKind:'fixed',permissions:m.tools.map(t=>'mcp.read:'+t.serverId+':'+t.name),binding:{pluginId:m.id,manifestHash:installed.manifestHash,runtimeHash:runtime.configHash}});
}
export async function serviceCatalog(state:Workspace,installed:InstalledPlugin[],configuration?:{runtime:PluginRuntimeDescriptor;priceCents:number}){
 const entries=await Promise.all(state.agents.filter(a=>a.enabled&&state.policy.allowedSkills.includes(a.skill)).map(a=>skillService(a))),excluded:{id:string;reason:string}[]=[];
 if(configuration)for(const plugin of installed.filter(p=>!isArchived(state,'plugin-version',p.manifest.id)))try{entries.push(await pluginService(plugin,configuration.runtime,configuration.priceCents));}catch{excluded.push({id:plugin.manifest.id,reason:'runtime-capability-unavailable'});}
 return {entries:entries.sort((a,b)=>a.id.localeCompare(b.id)),excluded};
}

/** Only guaranteed object properties can feed a later paid step. */
export function schemaAtPath(schema:PluginSchema,path:string[]):PluginSchema{
 let current=schema;for(const key of path){if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)||['constructor','prototype','__proto__'].includes(key)||current.type!=='object'||!current.required?.includes(key)||!Object.hasOwn(current.properties!,key))throw new DomainError('Service input path is not guaranteed by the source schema.','MODEL_REJECTED');current=current.properties![key];}return current;
}
/** Conservative structural assignability; a successful check guarantees all
 * values allowed by the source fit the target, not just a sample output. */
export function schemaAssignable(source:PluginSchema,target:PluginSchema):boolean{
 if(source.enum)return source.enum.every(value=>{try{validatePluginValue(source,value);validatePluginValue(target,value);return true;}catch{return false;}});
 if(target.enum)return false;
 if(source.type!==target.type&&!(source.type==='integer'&&target.type==='number'))return false;
 if(source.type==='number'||source.type==='integer')return (target.minimum===undefined||source.minimum!==undefined&&source.minimum>=target.minimum)&&(target.maximum===undefined||source.maximum!==undefined&&source.maximum<=target.maximum);
 if(source.type==='string')return (source.maxLength??8192)<=(target.maxLength??8192);
 if(source.type==='array')return source.maxItems!<=target.maxItems!&&schemaAssignable(source.items!,target.items!);
 if(source.type==='object')return target.required!.every(key=>source.required!.includes(key))&&Object.entries(source.properties!).every(([key,schema])=>Object.hasOwn(target.properties!,key)&&schemaAssignable(schema,target.properties![key]));
 return true;
}
export function checkServiceInput(target:ServiceDescriptor,input:Json|{source:ServiceDescriptor;path:string[]},derived=false){
 if(target.input.protocol!=='json.v1')throw new DomainError('This service requires its typed business-workflow adapter.','MODEL_REJECTED');
 if(!derived){validatePluginValue(target.input.schema,input);return;}
 const reference=input as {source:ServiceDescriptor;path:string[]};if(reference.source.output.protocol!=='json.v1'||!schemaAssignable(schemaAtPath(reference.source.output.schema,reference.path),target.input.schema))throw new DomainError('Service output and next input schemas are incompatible.','MODEL_REJECTED');
}
export const sameService=(a:ServiceDescriptor,b:ServiceDescriptor)=>canonical(a)===canonical(b);
