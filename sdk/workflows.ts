import {canonical} from '../cre/workflow/verify.ts';
import type {AgentWorkflow} from '../lib/agentos/workflow-state.ts';
import type {WorkflowDraft} from '../lib/agentos/workflows.ts';
import type {AgentWalletSession} from './wallet.ts';
export class AgentWorkflowClient{
 readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
 private async request(body?:unknown){const r=await fetch(this.baseURL+'/api/workflows',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',cache:'no-store',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)}),data=await r.json() as {workflow:AgentWorkflow;workflows:AgentWorkflow[];error?:string};if(!r.ok)throw new Error(data.error??'Workflow service is unavailable. Checkpoint retained.');return data;}
 async create(draft:Omit<WorkflowDraft,'buyer'>){await this.session.assertSession();const {workflow}=await this.request({action:'create',...draft,buyer:this.session.account});if(canonical(workflow.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase()||workflow.buyer.toLowerCase()!==this.session.account.toLowerCase())throw new Error('Workflow differs from the connected wallet deployment.');return workflow;}
 async list(){return (await this.request()).workflows;}
 async resume(workflowId:string){return (await this.request({action:'resume',workflowId})).workflow;}
 async cancel(workflowId:string){return (await this.request({action:'cancel',workflowId})).workflow;}
 async recover(){const r=await fetch(this.baseURL+'/api/runtime',{method:'POST',headers:this.headers,credentials:'include',signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error('Workflow service is unavailable. Checkpoint retained.');}
}
