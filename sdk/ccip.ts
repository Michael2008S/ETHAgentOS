import {z} from 'zod';
import {verifyCCIPJob,type CCIPDraft,type CCIPJob} from '../lib/agentos/ccip-tasks.ts';
const job=z.custom<CCIPJob>(value=>Boolean(value&&typeof value==='object'&&'termsHash' in value&&'draft' in value));
const responseSchema=z.object({scope:z.string().regex(/^0x[0-9a-f]{64}$/),task:job.optional(),tasks:z.array(job).optional()}).strict();
export class AgentCCIPClient {
 base:string;headers:Record<string,string>;scope?:string;
 constructor(base:string,headers:Record<string,string>={}){this.base=base;this.headers=headers;}
 async call(body?:unknown,id?:string){
  const response=await fetch(this.base+'/api/ccip-tasks'+(id?'?id='+encodeURIComponent(id):''),{method:body?'POST':'GET',headers:{...this.headers,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
  if(!response.ok){await response.body?.cancel();throw Error('CCIP request failed with status '+response.status);}
  const data=responseSchema.parse(await response.json());if(this.scope&&this.scope!==data.scope)throw Error('CCIP workspace changed');for(const task of [...(data.tasks??[]),...(data.task?[data.task]:[])]){await verifyCCIPJob(task);if(task.scope!==data.scope)throw Error('CCIP task workspace mismatch');}this.scope=data.scope;return data;
 }
 async list(){return(await this.call()).tasks??[];}
 async create(draft:CCIPDraft){if(!this.scope)await this.list();const task=(await this.call({action:'create',scope:this.scope,draft})).task;if(!task)throw Error('Missing CCIP task');return task;}
 async get(id:string){const task=(await this.call(undefined,id)).task;if(!task)throw Error('Missing CCIP task');return task;}
 async control(id:string,action:'cancel'|'recover'){if(!this.scope)await this.list();const task=(await this.call({action,scope:this.scope,id})).task;if(!task)throw Error('Missing CCIP task');return task;}
}
