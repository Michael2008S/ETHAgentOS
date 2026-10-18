import type { Workspace } from './types.ts';
import { advanceOrder,authorizeSettlement,findOrder,finishOrder,orderEvent,pendingOrders } from './orders.ts';
import type { OrderChain } from './order-chain.ts';
import { DomainError } from './engine.ts';
type OrderStore={read(ownerId:string):Promise<{state:Workspace}>;updateWorkspace(ownerId:string,reduce:(state:Workspace)=>Promise<Workspace>|Workspace):Promise<{state:Workspace}>};
export async function runOrder(store:OrderStore,ownerId:string,id:string,chain:OrderChain,options:{delayMs?:number;now?:()=>string;maxSteps?:number}={}){
  let failures=0;
  for(let step=0;step<(options.maxSteps??16);step++){
    try{
      const {state}=await store.read(ownerId),order=findOrder(state,id),now=options.now?.()??new Date().toISOString();
      if(!pendingOrders(state).some(o=>o.id===id))return {orderId:id,status:order.status};
      const view=await chain.inspect(order);
      if(view.status===0)throw new DomainError('Confirmed escrow is no longer available. Execution is suspended.','CONFLICT');
      if(view.status===2||view.status===3){const hash=await chain.settle(order);if(!hash)return {orderId:id,status:'awaiting-settlement'};const evidence=await chain.settlement(order,hash);await store.updateWorkspace(ownerId,current=>finishOrder(current,id,evidence,now));continue;}
      if(order.status==='awaiting-settlement'){
        // Linearize the final authority check and immutable publication intent in D1.
        const prepared=await store.updateWorkspace(ownerId,current=>authorizeSettlement(current,id,view.intent.id,now)),ready=findOrder(prepared.state,id);
        const hash=await chain.settle(ready);if(!hash)return {orderId:id,status:'awaiting-settlement'};
        const evidence=await chain.settlement(ready,hash);await store.updateWorkspace(ownerId,current=>finishOrder(current,id,evidence,now));continue;
      }
      if(view.timestamp>=view.intent.deadline){await store.updateWorkspace(ownerId,current=>{const next=structuredClone(current),o=findOrder(next,id);o.failure='Escrow deadline passed.';o.status='awaiting-settlement';return next;});continue;}
      if(options.delayMs)await new Promise(resolve=>setTimeout(resolve,options.delayMs));
      await store.updateWorkspace(ownerId,current=>advanceOrder(current,id,order.step,options.now?.()??new Date().toISOString()));
    }catch(error){
      if(++failures>=3){
        const message=error instanceof DomainError?error.message:'Chain execution request failed; durable checkpoint retained.';
        await store.updateWorkspace(ownerId,current=>{const existing=findOrder(current,id);if(existing.settlement||existing.lastError===message)return current;const next=structuredClone(current),order=findOrder(next,id);order.lastError=message;orderEvent(order,'Order awaits chain recovery',message,undefined,'warning');return next;}).catch(()=>{});
        return {orderId:id,status:'retryable',error:message};
      }
      await new Promise(resolve=>setTimeout(resolve,100*failures));
    }
  }
  return {orderId:id,status:'retryable'};
}
