import {canonical} from '../cre/workflow/verify.ts';
import {normalizePlanParameters,verifyWorkflowProposal,type WorkflowProposal} from '../lib/agentos/workflow-plans.ts';
import type {WorkflowPlanParameters} from '../lib/agentos/workflow-plan-schema.ts';
import type {AgentWorkflow} from '../lib/agentos/workflow-state.ts';
import type {AgentWalletSession} from './wallet.ts';
import type {TaskInput} from '../lib/agentos/types.ts';

export class AgentWorkflowPlanClient{
 readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
 private async request(body?:unknown){const r=await fetch(this.baseURL+'/api/workflow-plans',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',cache:'no-store',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)}),data=await r.json() as {proposal:WorkflowProposal;plans:WorkflowProposal[];workflow?:AgentWorkflow;scope:string;omitted?:number;error?:string};if(!r.ok)throw new Error(data.error??'Workflow planning is unavailable. No purchase was created.');return data;}
 private async verify(proposal:WorkflowProposal){await verifyWorkflowProposal(proposal);if(proposal.parameters.buyer.toLowerCase()!==this.session.account.toLowerCase()||canonical(proposal.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase())throw new Error('Workflow plan differs from the connected wallet deployment.');}
 async propose(input:Omit<WorkflowPlanParameters,'buyer'|'input'>&{input?:TaskInput}){
  await this.session.assertSession();const parameters=normalizePlanParameters({...input,buyer:this.session.account}),{proposal,scope}=await this.request({action:'propose',...parameters});await this.verify(proposal);
  if(proposal.workspaceHash!==scope||canonical(proposal.parameters)!==canonical(parameters))throw new Error('Workflow plan differs from the requested goal, input or fee limits.');return proposal;
 }
 async list(){const {plans,scope}=await this.request(),own=plans.filter(p=>p.parameters.buyer.toLowerCase()===this.session.account.toLowerCase()&&canonical(p.deployment).toLowerCase()===canonical(this.session.deployment).toLowerCase());for(const plan of own){await this.verify(plan);if(plan.workspaceHash!==scope)throw new Error('Workflow plan belongs to another workspace.');}return own;}
 async accept(proposal:WorkflowProposal){
  await this.session.assertSession();await this.verify(proposal);const {workflow}=await this.request({action:'accept',planId:proposal.id,digest:proposal.digest}),draft=proposal.draft;
  if(!workflow||workflow.planId!==proposal.id||workflow.requestId!==draft.requestId||workflow.buyer.toLowerCase()!==this.session.account.toLowerCase()||canonical(workflow.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase()||workflow.title!==draft.title||workflow.vaultSessionId!==draft.vaultSessionId||workflow.timeoutSeconds!==draft.timeoutSeconds||canonical(workflow.input)!==canonical(draft.input)||canonical(workflow.steps.map(s=>({agentId:s.agentId,budget:s.budget,input:s.input,...(s.supplierId?{supplierId:s.supplierId}:{}),...(s.when?{when:s.when}:{})})))!==canonical(draft.steps))throw new Error('Created workflow differs from the reviewed model plan.');return workflow;
 }
 async dismiss(planId:string){return (await this.request({action:'dismiss',planId})).proposal;}
}
