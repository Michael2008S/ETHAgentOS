import {DomainError} from './engine.ts';
import {findWorkflow,advanceWorkflow,type EvidencePublisher} from './workflows.ts';
import {findOrder} from './orders.ts';
import {runOrder} from './order-runner.ts';
import type {Workspace} from './types.ts';
import type {OrderChain} from './order-chain.ts';
import type {WorkflowSupplierAccess} from './workflow-suppliers.ts';
type Store=Parameters<typeof runOrder>[0];
type Options=Parameters<typeof runOrder>[4]&{workflowSuppliers?:WorkflowSupplierAccess};
/** One fenced graph drive: serialize funding, overlap independent execution, then publish joins. */
export async function runParallelWorkflow(store:Store,owner:string,id:string,chain:OrderChain,publish:EvidencePublisher,options:Options={}){
 const now=()=>options.now?.()??new Date().toISOString(),token=crypto.randomUUID(),claimed=await store.updateWorkspace(owner,state=>{
  const w=findWorkflow(state,id);if(w.status!=='running'||w.runLease&&w.runLease.expiresAt>now())return state;
  const next=structuredClone(state);findWorkflow(next,id).runLease={token,expiresAt:new Date(Date.parse(now())+360000).toISOString()};return next;
 });
 if(findWorkflow(claimed.state,id).runLease?.token!==token)return {workflowId:id,status:findWorkflow(claimed.state,id).status==='running'?'busy':findWorkflow(claimed.state,id).status};
 const permitted=(state:Workspace)=>{const w=findWorkflow(state,id);if(w.status!=='running'||w.runLease?.token!==token||w.runLease.expiresAt<=now())throw new DomainError('Parallel workflow drive no longer owns its lease.','CONFLICT');};
 const guarded={read:async(key:string)=>{const snapshot=await store.read(key);permitted(snapshot.state);return snapshot;},updateWorkspace:(key:string,reduce:(state:Workspace)=>Workspace|Promise<Workspace>)=>store.updateWorkspace(key,state=>{permitted(state);return reduce(state);})};
 try{
  const snapshot=await guarded.updateWorkspace(owner,state=>advanceWorkflow(state,id,chain,publish,now(),options.workflowSuppliers)),w=findWorkflow(snapshot.state,id);if(w.status!=='running')return {workflowId:id,status:w.status};
  const orders=w.steps.flatMap(s=>s.orderId?[findOrder(snapshot.state,s.orderId)]:[]).filter(o=>!['completed','refunded','cancelled','paused'].includes(o.status));
  for(const order of orders.filter(o=>!o.funding)){
   const result=await runOrder(guarded,owner,order.id,chain,{...options,maxSteps:1});if(result.error)return {workflowId:id,status:'retryable',error:result.error};
  }
  const funded=await guarded.read(owner),ready=findWorkflow(funded.state,id).steps.flatMap(s=>s.orderId?[findOrder(funded.state,s.orderId)]:[]).filter(o=>o.funding&&!['completed','refunded','cancelled','paused'].includes(o.status));
  const results=await Promise.allSettled(ready.slice(0,w.parallelism).map(o=>runOrder(guarded,owner,o.id,chain,options)));
  const final=await guarded.updateWorkspace(owner,state=>advanceWorkflow(state,id,chain,publish,now(),options.workflowSuppliers));
  const failed=results.find(r=>r.status==='fulfilled'&&r.value.error);return {workflowId:id,status:findWorkflow(final.state,id).status,...(failed?.status==='fulfilled'?{status:'retryable',error:failed.value.error}:results.some(r=>r.status==='rejected')?{status:'retryable',error:'Parallel workflow execution is unavailable. Checkpoint retained.'}:{})};
 }catch(error){const state=await store.read(owner),w=findWorkflow(state.state,id);if(w.status!=='running')return {workflowId:id,status:w.status};if(error instanceof DomainError&&error.code==='CONFLICT')return {workflowId:id,status:'busy'};throw error;
 }finally{await store.updateWorkspace(owner,state=>{if(findWorkflow(state,id).runLease?.token!==token)return state;const next=structuredClone(state);delete findWorkflow(next,id).runLease;return next;});}
}
