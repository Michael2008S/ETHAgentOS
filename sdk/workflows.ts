import {canonical} from '../cre/workflow/verify.ts';
import type {AgentWorkflow} from '../lib/agentos/workflow-state.ts';
import type {WorkflowDraft} from '../lib/agentos/workflows.ts';
import type {AgentWalletSession} from './wallet.ts';
import {normalizeInput} from '../lib/agentos/engine.ts';
type WithoutBuyer<T>=T extends unknown?Omit<T,'buyer'>:never;
export class AgentWorkflowClient{
 readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
 private async request(body?:unknown){const r=await fetch(this.baseURL+'/api/workflows',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',cache:'no-store',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)}),data=await r.json() as {workflow:AgentWorkflow;workflows:AgentWorkflow[];error?:string};if(!r.ok)throw new Error(data.error??'Workflow service is unavailable. Checkpoint retained.');return data;}
 async create(draft:WithoutBuyer<WorkflowDraft>){
  await this.session.assertSession();
  const supplierMode=draft.steps?.some(s=>s.supplierId);let scope:string|undefined;
  if(supplierMode){const response=await fetch(this.baseURL+'/api/workspace',{headers:this.headers,credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Workspace unavailable.');scope=(await response.json() as {scope:string}).scope;}
  const {workflow}=await this.request({action:'create',...draft,buyer:this.session.account});
  if(canonical(workflow.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase()||workflow.buyer.toLowerCase()!==this.session.account.toLowerCase())throw new Error('Workflow differs from the connected wallet deployment.');
  if(supplierMode){
   const returned=workflow.steps.map(s=>({agentId:s.agentId,budget:s.budget,input:s.input,...(s.supplierId?{supplierId:s.supplierId}:{}),...(s.when?{when:s.when}:{})}));
   if(workflow.version!=='agentos.workflow.v3'||draft.supplierPricing!=='signed-at-execution-under-cap'||workflow.workspaceHash!==scope||workflow.requestId!==draft.requestId||workflow.title!==draft.title||workflow.vaultSessionId!==draft.vaultSessionId||workflow.timeoutSeconds!==draft.timeoutSeconds||canonical(workflow.input)!==canonical(normalizeInput(draft.input))||canonical(returned)!==canonical(draft.steps)||workflow.steps.some(s=>s.supplierId&&(!s.supplierBinding||s.supplierBinding.supplier.id!==s.supplierId||s.supplierBinding.identity.agentId!==s.agentId||s.quote!==s.budget)))throw new Error('Supplier workflow differs from the approved providers, inputs or price ceilings.');
  }
  return workflow;
 }
 async list(){return (await this.request()).workflows;}
 async resume(workflowId:string){return (await this.request({action:'resume',workflowId})).workflow;}
 async cancel(workflowId:string){return (await this.request({action:'cancel',workflowId})).workflow;}
 async recover(){const r=await fetch(this.baseURL+'/api/runtime',{method:'POST',headers:this.headers,credentials:'include',signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error('Workflow service is unavailable. Checkpoint retained.');}
}
