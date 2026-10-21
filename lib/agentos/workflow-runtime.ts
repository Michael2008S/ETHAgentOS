import {after} from 'next/server';
import {configuredOrderChain} from './order-runtime';
import * as store from './store';
import {DomainError} from './engine';
import {pendingWorkflows,type EvidencePublisher} from './workflows';
import {runWorkflow} from './workflow-runner';
import type {Workspace} from './types';
import type {DeliverySpec} from '../../cre/workflow/verify';

export function workflowPublisher(configured:Awaited<ReturnType<typeof configuredOrderChain>>):EvidencePublisher{
 return async bytes=>{if(!configured.localCall)throw new DomainError('Immutable workflow evidence publishing is not configured.','UNAVAILABLE');return configured.localCall!<DeliverySpec>('/drafts',bytes);};
}
export function scheduleWorkflows(ownerId:string,state:Workspace,request:Request){
 const workflows=pendingWorkflows(state).slice(0,4);if(!workflows.length)return;
 after(async()=>{try{const configured=await configuredOrderChain(request);for(const w of workflows)await runWorkflow(store,ownerId,w.id,configured.chain,workflowPublisher(configured),configured);}catch{console.error('[agentos] Workflow checkpoint awaits runtime recovery.');}});
}
