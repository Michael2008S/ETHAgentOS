import {advanceWorkflow,findWorkflow,type EvidencePublisher} from './workflows.ts';
import {runOrder} from './order-runner.ts';
import {findOrder} from './orders.ts';
import type {OrderChain} from './order-chain.ts';
import type {WorkflowSupplierAccess} from './workflow-suppliers.ts';
import {runParallelWorkflow} from './workflow-parallel-runner.ts';

type OrderStore=Parameters<typeof runOrder>[0];
/** The workflow has its own durable job, including the gap after a paid parent. */
export async function runWorkflow(store:OrderStore,ownerId:string,id:string,chain:OrderChain,publish:EvidencePublisher,options:Parameters<typeof runOrder>[4]&{workflowSuppliers?:WorkflowSupplierAccess}={}){
 if(findWorkflow((await store.read(ownerId)).state,id).version==='agentos.workflow.v4')return runParallelWorkflow(store,ownerId,id,chain,publish,options);
 for(let tick=0;tick<2;tick++){
  const snapshot=await store.updateWorkspace(ownerId,state=>advanceWorkflow(state,id,chain,publish,undefined,options.workflowSuppliers)),w=findWorkflow(snapshot.state,id);
  if(w.status!=='running')return {workflowId:id,status:w.status};
  const step=w.steps.find(s=>s.orderId&&findOrder(snapshot.state,s.orderId).status!=='completed');
  if(!step?.orderId)continue;
  const result=await runOrder(store,ownerId,step.orderId,chain,options);
  if(result.status==='retryable'&&result.error)return {workflowId:id,status:'retryable',error:result.error};
 }
 const final=await store.updateWorkspace(ownerId,state=>advanceWorkflow(state,id,chain,publish,undefined,options.workflowSuppliers));
 return {workflowId:id,status:findWorkflow(final.state,id).status};
}
