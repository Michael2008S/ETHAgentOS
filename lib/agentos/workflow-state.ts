import type {Address} from 'viem';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {Skill,TaskInput,Workspace} from './types.ts';

export const MAX_WORKFLOW_STEPS=8;
export type WorkflowInputSource={from:'original'}|{from:'step';step:number};
export type WorkflowCondition={step:number;field:'concentrated'|'totalCents'|'transferCount'|'uniqueRecipients'|'accountCount';operator:'eq'|'gte'|'lte';value:number|boolean};
export type WorkflowStepDraft={agentId:string;budget:number;input:WorkflowInputSource;when?:WorkflowCondition;supplierId?:string};
export type WorkflowStep={requestId:string;agentId:string;skill:Skill;quote:number;budget:number;orderId?:string;input?:WorkflowInputSource;when?:WorkflowCondition;skippedAt?:string;skipReason?:string;supplierId?:string;supplierBinding?:import('./workflow-suppliers.ts').WorkflowSupplierBinding};
export type AgentWorkflow={version:'agentos.workflow.v1'|'agentos.workflow.v2'|'agentos.workflow.v3';workspaceHash?:string;id:string;requestId:string;title:string;buyer:Address;deployment:WalletDeployment;vaultSessionId:string;input:TaskInput;timeoutSeconds:number;totalBudget:number;status:'running'|'blocked'|'completed'|'cancelled';steps:WorkflowStep[];createdAt:string;updatedAt:string;lastError?:string};
/** Existing v1 records keep their original two-step allocation projection. */
export function workflowInput(step:WorkflowStep,index:number):WorkflowInputSource{return step.input??(index===0?{from:'original'}:{from:'step',step:index-1});}
/** Skipped steps release their reservation; existing orders account for themselves. */
export function futureWorkflowSteps(state:Workspace){
 return (state.workflows??[]).filter(w=>['running','blocked'].includes(w.status)).flatMap(w=>w.steps.filter(step=>!step.orderId&&!step.skippedAt).map(step=>({workflow:w,step})));
}
