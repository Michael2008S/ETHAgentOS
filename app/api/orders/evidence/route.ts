import { AgentChainClient } from '@/sdk/chain';
import { owner } from '@/lib/agentos/auth';import { read } from '@/lib/agentos/store';import { findOrder } from '@/lib/agentos/orders';import { orderEvidence,type EvidenceCheck } from '@/lib/agentos/order-evidence';import { configuredOrderChain } from '@/lib/agentos/order-runtime';import { inspectIdentity,verifyFeedback } from '@/lib/agentos/identity';import { matchingDeployment } from '@/lib/agentos/chain-reconciliation';import { apiFailure } from '@/lib/agentos/api-failure';
export async function GET(request:Request){try{
 const {state}=await read(owner(request)),order=findOrder(state,new URL(request.url).searchParams.get('id')??''),feedback=state.agentFeedback?.find(f=>f.orderId===order.id),evidence=await orderEvidence(order,feedback),fresh:EvidenceCheck[]=[];
 const attempt=async(id:string,present:boolean,check:()=>Promise<unknown>)=>{if(!present){fresh.push({id,status:'missing'});return;}try{await check();fresh.push({id,status:'verified'});}catch{fresh.push({id,status:'failed'});}};
 try{const configured=await configuredOrderChain(request);if(!matchingDeployment(configured.deployment,order.deployment))throw new Error('Different deployment');const historical=new AgentChainClient(configured.client,configured.deployment),view=await configured.chain.inspect(order);
  await Promise.all([
   attempt('Current identity',!!order.agentIdentity,()=>inspectIdentity(configured.client,configured.deployment,order.agentIdentity!)),
   attempt('Current supplier delegation',!!order.supplier,()=>configured.supplierAuthority(order)),
   attempt('Funding on current chain',!!order.funding,()=>historical.verifyEvidence(view.intent,order.funding!.transactionHash,'funding')),
   attempt('Settlement on current chain',!!order.settlement,()=>configured.chain.settlement(order,order.settlement!.transactionHash)),
   attempt('Feedback on current chain',!!feedback?.transactionHash,()=>verifyFeedback(state,order.id,feedback!.transactionHash!,configured.client,configured.deployment)),
  ]);
 }catch{for(const id of ['Current identity','Current supplier delegation','Funding on current chain','Settlement on current chain','Feedback on current chain'])fresh.push({id,status:'unavailable'});}
 return Response.json({...evidence,freshChecks:fresh},{headers:{'Cache-Control':'no-store'}});
}catch(error){return apiFailure(error,'chain');}}
