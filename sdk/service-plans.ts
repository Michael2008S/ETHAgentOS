import {canonical} from '../cre/workflow/verify.ts';
import {servicePlanParametersSchema,verifyServiceProposal,type ServicePlanParameters,type ServiceProposal} from '../lib/agentos/service-plans.ts';
import {verifyService,type ServiceDescriptor} from '../lib/agentos/service-catalog.ts';
export class AgentServicePlanClient{
 readonly baseURL:string;readonly scope:string;readonly headers:Record<string,string>;
 constructor(scope:string,baseURL='',headers:Record<string,string>={}){this.scope=scope;this.baseURL=baseURL;this.headers=headers;}
 private async call(body?:unknown,query=''){
  const r=await fetch(this.baseURL+'/api/service-plans'+query,{method:body?'POST':'GET',redirect:'error',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...this.headers},...(body?{body:JSON.stringify({...body as object,scope:this.scope})}:{}),signal:AbortSignal.timeout(90000)}),reader=r.body?.getReader();if(!reader)throw Error('Service planning response unavailable.');let size=0,text='';const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>1048576){await reader.cancel();throw Error('Service planning response exceeds its bound.');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  const value=JSON.parse(text);if(!r.ok)throw Error(typeof value?.error==='string'?value.error:'Service planning unavailable.');if(value.scope!==this.scope)throw Error('Service plan belongs to another workspace.');return value;
 }
 async catalogue(){const value=await this.call(undefined,'?catalogue=1');const entries=value.catalogue?.entries as ServiceDescriptor[];if(!Array.isArray(entries)||entries.length>64||new Set(entries.map(s=>s.id)).size!==entries.length)throw Error('Invalid service catalogue.');for(const s of entries)await verifyService(s);return entries;}
 async list(){const value=await this.call(),plans=value.plans as ServiceProposal[];if(!Array.isArray(plans)||plans.length>20)throw Error('Invalid service plan history.');for(const p of plans){await verifyServiceProposal(p);if(p.scope!==this.scope)throw Error('Service plan belongs to another workspace.');}return plans;}
 async propose(raw:ServicePlanParameters){const parameters=servicePlanParametersSchema.parse(raw),value=await this.call({action:'propose',parameters}),p=value.proposal as ServiceProposal;await verifyServiceProposal(p);if(p.template||p.replan||p.scope!==this.scope||canonical(p.parameters)!==canonical(parameters))throw Error('Service plan differs from its requested goal, input or fees.');return p;}
 async dismiss(planId:string){const value=await this.call({action:'dismiss',planId}),p=value.proposal as ServiceProposal;await verifyServiceProposal(p);if(p.scope!==this.scope||p.id!==planId||p.status!=='dismissed')throw Error('Service plan dismissal differs.');return p;}
}
