import {canonical} from '../../cre/workflow/verify.ts';
import {DomainError} from './engine.ts';
import type {Workspace} from './types.ts';
import type {ChainOrder} from './orders.ts';
import type {OrderChain} from './order-chain.ts';
import type {RouteRefundProof} from './purchase-route-state.ts';
/** A lost request or a local status string is never a refund certificate. */
export async function routeRefundProof(order:ChainOrder,chain:OrderChain,now=new Date().toISOString()):Promise<RouteRefundProof|null>{
 if(order.status==='refunded'&&order.settlement?.status==='refunded'){
  if(!chain.refundFinality)throw new DomainError('Refund finality verification is unavailable.','UNAVAILABLE');
  const proof=await chain.refundFinality(order);if(!proof)return null;
  return {kind:'refunded',checkedAt:now,transactionHash:proof.evidence.transactionHash,blockNumber:proof.evidence.blockNumber,blockHash:proof.evidence.blockHash,finalizedBlock:proof.finalizedBlock,finalizedBlockHash:proof.finalizedBlockHash};
 }
 if(order.status==='cancelled'&&!order.funding){const view=await chain.inspect(order);if(view.status===0&&(!order.vaultFunding||BigInt(order.vaultFunding.deadline)<=view.timestamp))return {kind:'unsent',checkedAt:now};}
 return null;
}
/** Re-read every prior refund immediately before a child can claim a funding intent. */
export async function verifyRouteFunding(state:Workspace,order:ChainOrder,chain:OrderChain){
 if(!order.purchaseRouteId)return;
 const route=state.purchaseRoutes?.find(r=>r.id===order.purchaseRouteId),index=route?.offers.findIndex(o=>o.orderId===order.id)??-1;
 if(!route||route.status!=='running'||index<0)throw new DomainError('Purchase route no longer authorizes this order.','FORBIDDEN');
 const offer=route.offers[index];
 if(order.buyer.toLowerCase()!==route.buyer.toLowerCase()||order.vaultSessionId!==route.vaultSessionId||canonical(order.deployment)!==canonical(route.deployment)||canonical(order.input)!==canonical(route.input)||canonical(order.supplierQuote)!==canonical(offer.supplierQuote)||canonical(order.supplier)!==canonical(offer.supplier))throw new DomainError('Purchase route order differs from its reviewed offer.','FORBIDDEN');
 for(const previous of route.offers.slice(0,index)){const prior=state.chainOrders?.find(o=>o.id===previous.orderId);if(!prior||!await routeRefundProof(prior,chain))throw new DomainError('Previous purchase refund is not canonically finalized.','UNAVAILABLE');}
}
