import {canonical} from '../cre/workflow/verify.ts';
import {repairPolicyInputSchema,verifyRepairPolicy,type RepairPolicyInput,type WorkflowRepairPolicy} from '../lib/agentos/workflow-repair-policy.ts';
import type {AgentWalletSession} from './wallet.ts';
export class AgentWorkflowRepairClient{
 readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
 private async request(body?:unknown){const response=await fetch(this.baseURL+'/api/workflow-repairs',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',cache:'no-store',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)}),data=await response.json() as {policy:WorkflowRepairPolicy;policies:WorkflowRepairPolicy[];scope:string;error?:string};if(!response.ok)throw new Error(data.error??'Automatic repair configuration is unavailable.');return data;}
 private async check(p:WorkflowRepairPolicy,scope:string){await verifyRepairPolicy(p);if(p.workspaceHash!==scope||p.parameters.buyer.toLowerCase()!==this.session.account.toLowerCase()||canonical(p.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase())throw new Error('Automatic repair policy differs from this wallet or workspace.');return p;}
 async configure(input:Omit<RepairPolicyInput,'buyer'>){await this.session.assertSession();const parameters=repairPolicyInputSchema.parse({...input,buyer:this.session.account}),data=await this.request({action:'configure',...parameters});await this.check(data.policy,data.scope);if(canonical(data.policy.parameters)!==canonical(parameters))throw new Error('Automatic repair policy changed the requested limits.');return data.policy;}
 async list(){const data=await this.request(),own=data.policies.filter(p=>p.parameters.buyer.toLowerCase()===this.session.account.toLowerCase()&&canonical(p.deployment).toLowerCase()===canonical(this.session.deployment).toLowerCase());for(const p of own)await this.check(p,data.scope);return own;}
 async cancel(policy:WorkflowRepairPolicy){return this.change(policy,'cancel');}
 async resume(policy:WorkflowRepairPolicy){return this.change(policy,'resume');}
 private async change(policy:WorkflowRepairPolicy,action:'cancel'|'resume'){await this.session.assertSession();const data=await this.request({action,policyId:policy.id,digest:policy.digest});await this.check(data.policy,data.scope);if(data.policy.id!==policy.id||data.policy.digest!==policy.digest)throw new Error('Automatic repair policy changed the requested limits.');return data.policy;}
}
