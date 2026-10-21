import type {Address} from 'viem';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {Skill,TaskInput,Workspace} from './types.ts';

export type WorkflowStep={requestId:string;agentId:string;skill:Skill;quote:number;budget:number;orderId?:string};
export type AgentWorkflow={version:'agentos.workflow.v1';id:string;requestId:string;title:string;buyer:Address;deployment:WalletDeployment;vaultSessionId:string;input:TaskInput;timeoutSeconds:number;totalBudget:number;status:'running'|'blocked'|'completed'|'cancelled';steps:[WorkflowStep,WorkflowStep];createdAt:string;updatedAt:string;lastError?:string};
/** Only steps without an order reserve here; existing orders account for themselves. */
export function futureWorkflowSteps(state:Workspace){
 return (state.workflows??[]).filter(w=>['running','blocked'].includes(w.status)).flatMap(w=>w.steps.filter(step=>!step.orderId).map(step=>({workflow:w,step})));
}
