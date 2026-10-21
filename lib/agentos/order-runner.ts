import type { Workspace } from './types.ts';
import { advanceOrder,authorizeSettlement,claimModelLease,commitModelPlan,claimSupplierLease,commitSupplierDelivery,orderPolicy,findOrder,finishOrder,orderEvent,pendingOrders } from './orders.ts';
import type { OrderChain } from './order-chain.ts';
import { DomainError } from './engine.ts';
import { canonical } from '../../cre/workflow/verify.ts';
import type { ModelPlan,OrderPlanner } from './model.ts';
import { supplierRequest,type OrderSupplier,type SupplierDelivery } from './supplier.ts';
import {claimVaultFunding,activateVaultOrder,vaultEscrowWindow} from './orders.ts';
import type {VaultFunder} from './vault-executor.ts';
import {verifyMemoryAuthority} from './artifact-memory.ts';
import type {ChainOrder} from './orders.ts';
type OrderStore={read(ownerId:string):Promise<{state:Workspace}>;updateWorkspace(ownerId:string,reduce:(state:Workspace)=>Promise<Workspace>|Workspace):Promise<{state:Workspace}>};
export async function runOrder(store:OrderStore,ownerId:string,id:string,chain:OrderChain,options:{delayMs?:number;now?:()=>string;maxSteps?:number;planner?:OrderPlanner;supplier?:OrderSupplier;supplierAuthority?:OrderSupplier['authorize'];vaultFunder?:VaultFunder}={}){
  let failures=0;
  async function settlementHash(order:ChainOrder){
    const hash=await chain.settle(order);if(hash)return hash;
    const scan=await chain.scanSettlement(order);if(scan.transactionHash)return scan.transactionHash;
    if(canonical(scan.cursor??null)!==canonical(order.settlementScan??null))await store.updateWorkspace(ownerId,state=>{
      const current=findOrder(state,id);if(current.settlement||canonical(current.settlementScan??null)!==canonical(order.settlementScan??null))return state;
      const next=structuredClone(state),updated=findOrder(next,id);if(scan.cursor)updated.settlementScan=scan.cursor;else delete updated.settlementScan;return next;
    });
    return null;
  }
  for(let step=0;step<(options.maxSteps??16);step++){
    try{
      const {state}=await store.read(ownerId),order=findOrder(state,id),now=options.now?.()??new Date().toISOString();
      if(!pendingOrders(state).some(o=>o.id===id))return {orderId:id,status:order.status};
      const view=await chain.inspect(order);
      if(order.status==='funding'&&!order.funding){
        if(view.status===0&&order.vaultFunding&&BigInt(order.vaultFunding.deadline)<=view.timestamp){await store.updateWorkspace(ownerId,current=>{const next=structuredClone(current),o=findOrder(next,id);if(o.status==='funding'&&!o.funding){o.status='cancelled';o.failure='Vault funding deadline passed without an escrow.';orderEvent(o,'Vault purchase denied',o.failure,now,'warning');}return next;});return {orderId:id,status:'cancelled'};}
        const token=crypto.randomUUID();
        try{
          if(view.status===0)await verifyMemoryAuthority(state,order,chain);
          const claimed=await store.updateWorkspace(ownerId,current=>claimVaultFunding(current,id,token,view.timestamp+BigInt(vaultEscrowWindow(order)),now,view.status!==0)),leased=findOrder(claimed.state,id);
          if(leased.vaultFunding?.token!==token)return {orderId:id,status:'funding'};
          if(!options.vaultFunder)throw new DomainError('Vault executor is unavailable.','UNAVAILABLE');
          const hash=await options.vaultFunder(leased),verified=await chain.funding(leased,hash);
          await store.updateWorkspace(ownerId,current=>activateVaultOrder(current,id,token,verified,options.now?.()??new Date().toISOString()));continue;
        }catch(error){
          if(error instanceof DomainError&&error.code==='FORBIDDEN'&&view.status===0){
            const snapshot=await store.read(ownerId),current=findOrder(snapshot.state,id);
            // A lost broadcast response is not proof that no funds moved. A
            // committed intent stays recoverable until its chain deadline.
            if(!current.vaultFunding||BigInt(current.vaultFunding.deadline)<=view.timestamp){await store.updateWorkspace(ownerId,state=>{const next=structuredClone(state),o=findOrder(next,id);if(o.status==='funding'&&!o.funding){o.status='cancelled';o.failure=error.message;orderEvent(o,'Vault purchase denied',error.message,now,'warning');}return next;});return {orderId:id,status:'cancelled'};}
          }
          throw error;
        }
      }
      if(view.status===0)throw new DomainError('Confirmed escrow is no longer available. Execution is suspended.','CONFLICT');
      if(order.input.memory&&!order.failure&&!order.settlementAuthorization&&view.status===1){
        try{await verifyMemoryAuthority(state,order,chain);}catch(error){
          if(!(error instanceof DomainError)||error.code!=='FORBIDDEN')throw error;
          await store.updateWorkspace(ownerId,current=>{const next=structuredClone(current),o=findOrder(next,id);if(!o.settlementAuthorization&&!o.settlement){o.failure=error.message;o.status='awaiting-settlement';}return next;});continue;
        }
      }
      if(view.status===2||view.status===3){const hash=await settlementHash(order);if(!hash)return {orderId:id,status:'awaiting-settlement'};const evidence=await chain.settlement(order,hash);await store.updateWorkspace(ownerId,current=>finishOrder(current,id,evidence,now));continue;}
      if(order.status==='awaiting-settlement'){
        if(order.executor==='supplier'&&!order.failure&&!order.settlementAuthorization){
          let denied=orderPolicy(state,order,now)??(order.deadlineAt&&order.deadlineAt<=now?'Execution deadline passed.':null);
          if(!denied)try{const authority=options.supplierAuthority??options.supplier?.authorize;if(!authority)throw new DomainError('Supplier authorization is temporarily unavailable.','SUPPLIER_UNAVAILABLE');await authority(order);}catch(error){if(error instanceof DomainError&&error.code==='SUPPLIER_REJECTED')denied=error.message;else throw error;}
          if(denied){await store.updateWorkspace(ownerId,current=>{const next=structuredClone(current),o=findOrder(next,id);if(!o.settlementAuthorization&&!o.settlement)o.failure=denied;return next;});continue;}
        }
        // Linearize the final authority check and immutable publication intent in D1.
        const prepared=await store.updateWorkspace(ownerId,current=>authorizeSettlement(current,id,view.intent.id,now)),ready=findOrder(prepared.state,id);
        const hash=await settlementHash(ready);if(!hash)return {orderId:id,status:'awaiting-settlement'};
        const evidence=await chain.settlement(ready,hash);await store.updateWorkspace(ownerId,current=>finishOrder(current,id,evidence,now));continue;
      }
      if(view.timestamp>=view.intent.deadline){await store.updateWorkspace(ownerId,current=>{const next=structuredClone(current),o=findOrder(next,id);o.failure='Escrow deadline passed.';o.status='awaiting-settlement';return next;});continue;}
      if(order.planner==='llm'&&order.step===2&&!order.modelPlan){
        const token=crypto.randomUUID(),claimed=await store.updateWorkspace(ownerId,current=>claimModelLease(current,id,token,now)),leased=findOrder(claimed.state,id);
        if(leased.status!=='running')continue;
        if(leased.modelLease?.token!==token)return {orderId:id,status:'planning'};
        let result:{plan?:ModelPlan;error?:string};
        try{if(!options.planner||canonical(options.planner.descriptor)!==canonical(leased.model))throw new DomainError('Configured model differs from the authorized order.','MODEL_UNAVAILABLE');result={plan:await options.planner.plan(leased)};}catch(error){result={error:error instanceof DomainError?error.message:'Model inference failed. No skill operation was executed.'};}
        await store.updateWorkspace(ownerId,current=>commitModelPlan(current,id,token,result,options.now?.()??new Date().toISOString()));continue;
      }
      if(order.executor==='supplier'&&order.step===2&&!order.supplierDelivery){
        const token=crypto.randomUUID(),claimed=await store.updateWorkspace(ownerId,current=>claimSupplierLease(current,id,token,now)),leased=findOrder(claimed.state,id);
        if(leased.status!=='running')continue;if(leased.supplierLease?.token!==token)return {orderId:id,status:'executing'};
        let result:{delivery?:SupplierDelivery;error?:string;retryable?:boolean};
        try{if(!options.supplier)throw new DomainError('Supplier is temporarily unavailable. The execution checkpoint is retained.','SUPPLIER_UNAVAILABLE');if(canonical(options.supplier.descriptor)!==canonical(leased.supplier))throw new DomainError('Supplier configuration differs from the authorized order.','SUPPLIER_REJECTED');await options.supplier.authorize(leased);const delivery=await options.supplier.execute(await supplierRequest(leased));await options.supplier.authorize(leased);result={delivery};}
        catch(error){result={error:error instanceof DomainError?error.message:'Supplier request failed. The execution checkpoint is retained.',retryable:!(error instanceof DomainError)||error.code==='SUPPLIER_UNAVAILABLE'};}
        await store.updateWorkspace(ownerId,current=>commitSupplierDelivery(current,id,token,result,options.now?.()??new Date().toISOString()));
        if(result.retryable)throw new DomainError(result.error!,'SUPPLIER_UNAVAILABLE');continue;
      }
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
