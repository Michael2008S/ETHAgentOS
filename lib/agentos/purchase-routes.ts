import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError,resolveSkillInput} from './engine.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import {makeSupplierQuoteRequest,verifySupplierQuote} from './supplier-quote.ts';
import {vaultAllowance,assertVaultSeller,type VaultSession} from './vault.ts';
import {createOrder,findOrder} from './orders.ts';
import {verifyAcceptedOrder} from './artifact-memory.ts';
import {routeRefundProof} from './purchase-route-proof.ts';
import type {Workspace} from './types.ts';
import type {OrderChain} from './order-chain.ts';
import type {EvidencePublisher} from './workflows.ts';
import {purchaseRouteDraftSchema} from './purchase-route-schema.ts';
import type {PurchaseRoute,PurchaseRouteDraft,RouteOffer} from './purchase-route-state.ts';
export type RouteAccess={chain:OrderChain;publish:EvidencePublisher;chainTime:()=>Promise<number>;authorize:(offer:RouteOffer)=>Promise<void>;checkSession:(session:VaultSession,grossCents:number)=>Promise<void>};
export function findPurchaseRoute(state:Workspace,id:string){const r=state.purchaseRoutes?.find(r=>r.id===id);if(!r)throw new DomainError('Purchase route not found.','NOT_FOUND');return r;}
export async function routeOrderRequestId(scope:string,requestId:string,agentId:string,supplierId:string){const h=(await digest({scope,requestId,agentId,supplierId,purpose:'agentos.purchase-route.v1'})).slice(2);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
export const purchaseRouteParameters=(r:PurchaseRoute)=>({requestId:r.requestId,title:r.title,buyer:r.buyer,vaultSessionId:r.vaultSessionId,input:r.input,totalBudget:r.totalBudget,timeoutSeconds:r.timeoutSeconds,strategy:r.strategy,offers:r.offers.map(o=>({agentId:o.agentId,supplierId:o.supplierId,supplierQuote:o.supplierQuote}))});
export async function validatePurchaseRoute(state:Workspace,draft:PurchaseRouteDraft,deployment:WalletDeployment,scope:string,offers:RouteOffer[],access:RouteAccess){
 if(!purchaseRouteDraftSchema.safeParse(draft).success||offers.length!==draft.offers.length||new Set(offers.map(o=>o.supplierId)).size!==offers.length)throw new DomainError('A purchase route requires two or three distinct suppliers.');
 const first=state.agents.find(a=>a.id===draft.offers[0].agentId);if(!first)throw new DomainError('Unknown route service.');const input=resolveSkillInput(state,first.skill,draft.input),now=await access.chainTime(),total=offers.reduce((s,o)=>s+o.supplierQuote.payload.priceCents,0);
 if(total>draft.totalBudget)throw new DomainError('All purchase attempts must fit the approved gross budget.','FORBIDDEN');
 if(draft.strategy==='lowest-price'&&canonical(offers.map(o=>o.agentId+':'+o.supplierId))!==canonical([...offers].sort((a,b)=>a.supplierQuote.payload.priceCents-b.supplierQuote.payload.priceCents||(a.agentId+':'+a.supplierId).localeCompare(b.agentId+':'+b.supplierId)).map(o=>o.agentId+':'+o.supplierId)))throw new DomainError('Purchase route order differs from its price strategy.');
 const session=vaultAllowance(state,draft.vaultSessionId,draft.buyer,first.skill,Math.max(...offers.map(o=>o.supplierQuote.payload.priceCents)),total);await access.checkSession(session,total);
 for(const [i,offer] of offers.entries()){
  const agent=state.agents.find(a=>a.id===offer.agentId),price=offer.supplierQuote.payload.priceCents;
  if(offer.supplierId!==offer.supplier.id||offer.identity.agentId!==offer.agentId||!agent?.enabled||agent.skill!==first.skill||!state.policy.active||!state.policy.allowedSkills.includes(agent.skill)||price>state.policy.maxTaskBudget||canonical(draft.offers[i])!==canonical({agentId:offer.agentId,supplierId:offer.supplierId,supplierQuote:offer.supplierQuote}))throw new DomainError('Every route offer requires the same authorized skill and reviewed price.','FORBIDDEN');
  if(canonical(resolveSkillInput(state,agent.skill,draft.input))!==canonical(input))throw new DomainError('Route suppliers must accept identical inputs.');
  assertVaultSeller(session,offer.identity.wallet);await access.authorize(offer);
  const requestId=await routeOrderRequestId(scope,draft.requestId,offer.agentId,offer.supplierId),expected=await makeSupplierQuoteRequest({requestId,workspaceHash:scope,buyer:draft.buyer,payer:session.vault,agentId:offer.agentId,skill:agent.skill,input,identity:offer.identity,deployment,supplier:offer.supplier});
  await verifySupplierQuote(offer.supplierQuote,expected,offer.supplier,now);
 }
 return {input,skill:first.skill};
}
async function addRouteOrder(state:Workspace,route:PurchaseRoute,index:number,access:RouteAccess,now:string){
 const offer=route.offers[index],requestId=offer.supplierQuote.payload.request.requestId;
 await access.authorize(offer);const session=state.vaultSessions?.find(s=>s.sessionId===route.vaultSessionId);if(!session)throw new DomainError('Route Vault session is unavailable.','FORBIDDEN');await access.checkSession(session,route.offers.slice(index).reduce((sum,o)=>sum+o.supplierQuote.payload.priceCents,0));
 const bytes=inputEvidence({id:'chain-'+requestId,input:route.input,skill:route.skill},route.buyer),spec=await access.publish(bytes);
 if(spec.datasetHash!==bytes.datasetHash||canonical(spec.verification)!==canonical(bytes.verification))throw new DomainError('Route evidence differs from its committed input.','CONFLICT');
 offer.orderId='chain-'+requestId;
 return createOrder(state,{purchaseRouteId:route.id,requestId,title:route.title+' · '+(index+1),buyer:route.buyer,agentId:offer.agentId,vaultSessionId:route.vaultSessionId,input:route.input,budget:offer.supplierQuote.payload.priceCents,executor:'supplier',supplier:offer.supplier,agentIdentity:offer.identity,supplierQuote:offer.supplierQuote,spec,scenario:'success',timeoutSeconds:route.timeoutSeconds},route.deployment,now,{now:await access.chainTime(),workspaceHash:route.workspaceHash});
}
export async function createPurchaseRoute(state:Workspace,draft:PurchaseRouteDraft,deployment:WalletDeployment,scope:string,offers:RouteOffer[],access:RouteAccess,now=new Date().toISOString()){
 const first=state.agents.find(a=>a.id===draft.offers[0]?.agentId);if(!first)throw new DomainError('Unknown route service.');const parameters={...draft,input:resolveSkillInput(state,first.skill,draft.input)},prior=state.purchaseRoutes?.find(r=>r.requestId===draft.requestId);
 if(prior){if(canonical(purchaseRouteParameters(prior))!==canonical(parameters)||prior.workspaceHash!==scope||canonical(prior.deployment)!==canonical(deployment))throw new DomainError('Route request ID was already used with different parameters.','IDEMPOTENCY_CONFLICT');return state;}
 if((state.purchaseRoutes?.length??0)>=100)throw new DomainError('Workspace purchase route limit reached.');
 const checked=await validatePurchaseRoute(state,draft,deployment,scope,offers,access),next=structuredClone(state),route:PurchaseRoute={...parameters,...checked,version:'agentos.purchase-route.v1',id:'purchase-'+draft.requestId,workspaceHash:scope,deployment:{...deployment},offers:structuredClone(offers),status:'running',createdAt:now,updatedAt:now};
 next.purchaseRoutes=[route,...next.purchaseRoutes??[]];return addRouteOrder(next,route,0,access,now);
}
export async function advancePurchaseRoute(state:Workspace,id:string,access:RouteAccess,now=new Date().toISOString()):Promise<Workspace>{
 const original=findPurchaseRoute(state,id);if(original.status!=='running'||original.notBefore&&original.notBefore>now)return state;const next=structuredClone(state),route=findPurchaseRoute(next,id);
 try{
  for(const [index,offer] of route.offers.entries()){
   if(!offer.orderId){route.updatedAt=now;return await addRouteOrder(next,route,index,access,now);}
   const order=findOrder(next,offer.orderId);
   if(order.status==='completed'&&order.settlement?.status==='paid'){await verifyAcceptedOrder(next,order,access.chain);route.status='completed';route.completedOrderId=order.id;route.updatedAt=now;delete route.lastError;return next;}
   if(!['refunded','cancelled'].includes(order.status))return next;
   const proof=await routeRefundProof(order,access.chain,now);if(!proof){route.notBefore=new Date(Date.parse(now)+(route.deployment.mode==='testnet'?60000:1000)).toISOString();return next;}delete route.notBefore;offer.refundProof=proof;
  }
  route.status='exhausted';route.updatedAt=now;route.lastError='All approved supplier attempts ended without a paid accepted result.';return next;
 }catch(error){
  if(!(error instanceof DomainError)||!['FORBIDDEN','INVALID_COMMAND','CONFLICT','SUPPLIER_REJECTED'].includes(error.code))throw error;
  const blocked=structuredClone(state),r=findPurchaseRoute(blocked,id);r.status='blocked';r.lastError=error.message;r.updatedAt=now;return blocked;
 }
}
export function controlPurchaseRoute(state:Workspace,id:string,action:'resume'|'cancel',now=new Date().toISOString()){
 const existing=findPurchaseRoute(state,id);if(['completed','cancelled','exhausted'].includes(existing.status))return state;const next=structuredClone(state),route=findPurchaseRoute(next,id);
 if(action==='resume'){if(route.status!=='blocked')return state;route.status='running';delete route.lastError;delete route.notBefore;}
 else{route.status='cancelled';delete route.lastError;for(const offer of route.offers){if(!offer.orderId)continue;const o=findOrder(next,offer.orderId);if(o.settlement||o.settlementAuthorization)continue;if(!o.funding&&!o.vaultFunding)o.status='cancelled';else if(o.funding){o.failure='Purchase route was cancelled.';o.status='awaiting-settlement';}}}
 route.updatedAt=now;return next;
}
