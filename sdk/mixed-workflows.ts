import {canonical} from '../cre/workflow/verify.ts';
import {digest} from '../lib/agentos/engine.ts';
import {mixedWorkflowDraftSchema,verifyMixed,type MixedWorkflow,type MixedWorkflowDraft} from '../lib/agentos/mixed-workflow.ts';
import {verifyService,type ServiceDescriptor} from '../lib/agentos/service-catalog.ts';
import type {PluginRuntimeDescriptor} from '../lib/agentos/plugin-protocol.ts';
import type {WalletDeployment} from './wallet.ts';
export class AgentMixedWorkflowClient{
 readonly scope:string;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(scope:string,baseURL='',headers:Record<string,string>={}){this.scope=scope;this.baseURL=baseURL;this.headers=headers;}
 private async call(body?:unknown,query=''){
  const r=await fetch(this.baseURL+'/api/mixed-workflows'+query,{method:body?'POST':'GET',redirect:'error',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...this.headers},...(body?{body:JSON.stringify({...body as object,scope:this.scope})}:{}),signal:AbortSignal.timeout(120000)}),text=await r.text();if(text.length>1048576)throw Error('Mixed response exceeds its bound.');const value=JSON.parse(text);if(!r.ok)throw Error(value.error??'Mixed workflow unavailable.');if(value.scope!==this.scope)throw Error('Mixed workflow belongs to another workspace.');return value;
 }
 private async check(f:MixedWorkflow,id?:string){await verifyMixed(f);if(f.scope!==this.scope||id&&f.id!==id)throw Error('Mixed workflow scope or identifier differs.');return f;}
 async catalogue(){const v=await this.call(undefined,'?catalogue=1'),c=v.configuration as {catalog:ServiceDescriptor[];deployment:WalletDeployment;runtime:PluginRuntimeDescriptor;priceCents:number;payees?:Record<string,`0x${string}`>};if(!Array.isArray(c.catalog)||c.catalog.length>100)throw Error('Mixed catalog exceeds its bound.');for(const s of c.catalog)await verifyService(s);return c;}
 async list(){const v=await this.call();if(!Array.isArray(v.flows)||v.flows.length>20)throw Error('Mixed history exceeds its bound.');return Promise.all(v.flows.map((f:MixedWorkflow)=>this.check(f)));}
 async inspect(id:string){return this.check((await this.call(undefined,'?id='+encodeURIComponent(id))).flow,id);}
 async create(raw:MixedWorkflowDraft,review?:import('../lib/agentos/mixed-plans.ts').MixedPlanReview){const draft=mixedWorkflowDraftSchema.parse(raw),f=await this.check((await this.call({action:'create',draft,...(review?{review}:{})})).flow,'mixed-'+draft.requestId);if(canonical(f.planReview??null)!==canonical(review??null)||f.draftHash!==await digest(draft)||f.buyer.toLowerCase()!==draft.buyer.toLowerCase()||f.vaultSessionId!==draft.vaultSessionId||canonical(f.input)!==canonical(draft.input))throw Error('Mixed terms differ from the reviewed draft.');return f;}
 async recover(id:string){return this.check((await this.call({action:'recover',id})).flow,id);}
 async cancel(id:string){return this.check((await this.call({action:'cancel',id})).flow,id);}
}
