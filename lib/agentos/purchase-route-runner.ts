import {advancePurchaseRoute,findPurchaseRoute,type RouteAccess} from './purchase-routes.ts';
import {findOrder} from './orders.ts';
import {runOrder} from './order-runner.ts';
type Store=Parameters<typeof runOrder>[0];
/** A separate durable job spans refund finality and the gap before the next order. */
export async function runPurchaseRoute(store:Store,ownerId:string,id:string,access:RouteAccess,options:Parameters<typeof runOrder>[4]={}){
 for(let tick=0;tick<3;tick++){
  const snapshot=await store.updateWorkspace(ownerId,state=>advancePurchaseRoute(state,id,access)),route=findPurchaseRoute(snapshot.state,id);
  if(route.status!=='running')return {routeId:id,status:route.status};
  const active=route.offers.find(o=>o.orderId&&!['completed','refunded','cancelled'].includes(findOrder(snapshot.state,o.orderId).status));
  if(!active?.orderId)return {routeId:id,status:'awaiting-refund-finality'};
  const result=await runOrder(store,ownerId,active.orderId,access.chain,options);if(result.status==='retryable'&&result.error)return {routeId:id,status:'retryable',error:result.error};
 }
 const final=await store.updateWorkspace(ownerId,state=>advancePurchaseRoute(state,id,access));return {routeId:id,status:findPurchaseRoute(final.state,id).status};
}
