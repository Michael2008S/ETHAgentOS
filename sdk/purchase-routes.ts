import {canonical} from '../cre/workflow/verify.ts';
import {resolveSkillInput} from '../lib/agentos/engine.ts';
import {makeSupplierQuoteRequest,verifySupplierQuote} from '../lib/agentos/supplier-quote.ts';
import {authorizeSupplier} from '../lib/agentos/supplier-chain.ts';
import {routeOrderRequestId,purchaseRouteParameters} from '../lib/agentos/purchase-routes.ts';
import type {PurchaseRouteDraft,PurchaseRoute} from '../lib/agentos/purchase-route-state.ts';
import type {AgentWalletSession} from './wallet.ts';
import type {Workspace} from '../lib/agentos/types.ts';
import type {SupplierDescriptor} from '../lib/agentos/supplier.ts';
export type PreparePurchaseRoute=Omit<PurchaseRouteDraft,'buyer'|'offers'|'requestId'>&{requestId?:string;candidates:{agentId:string;supplierId:string}[]};
export class AgentPurchaseRouteClient{
 readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
 private async request(body?:unknown){const r=await fetch(this.baseURL+'/api/purchase-routes',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',cache:'no-store',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)}),data=await r.json() as {draft:PurchaseRouteDraft;route:PurchaseRoute;routes:PurchaseRoute[];scope:string;error?:string};if(!r.ok)throw new Error(data.error??'Purchase route service is unavailable. Checkpoint retained.');return data;}
 private async workspace(){const r=await fetch(this.baseURL+'/api/workspace',{headers:this.headers,credentials:'include',cache:'no-store'});if(!r.ok)throw new Error('Workspace unavailable.');return r.json() as Promise<{state:Workspace;scope:string}>;}
 async prepare(input:PreparePurchaseRoute){
  await this.session.assertSession();const requestId=input.requestId??crypto.randomUUID(),snapshot=await this.workspace(),response=await this.request({...input,requestId,buyer:this.session.account,action:'prepare'}),draft=response.draft;
  if(response.scope!==snapshot.scope||draft.requestId!==requestId||draft.buyer.toLowerCase()!==this.session.account.toLowerCase()||draft.vaultSessionId!==input.vaultSessionId||draft.totalBudget!==input.totalBudget||draft.strategy!==input.strategy||draft.timeoutSeconds!==input.timeoutSeconds||draft.title!==input.title||draft.offers.length!==input.candidates.length)throw new Error('Prepared route differs from the requested purchase.');
  const catalogResponse=await fetch(this.baseURL+'/api/suppliers',{headers:this.headers,credentials:'include',cache:'no-store'});if(!catalogResponse.ok)throw new Error('Supplier catalog unavailable.');const catalog=await catalogResponse.json() as {descriptors:SupplierDescriptor[]};
  if(!this.session.deployment.vault)throw new Error('AgentVault is not configured.');
  let total=0;const seen=new Set<string>();
  for(const offer of draft.offers){
   if(!input.candidates.some(c=>c.agentId===offer.agentId&&c.supplierId===offer.supplierId)||seen.has(offer.supplierId))throw new Error('Prepared route substituted a supplier.');seen.add(offer.supplierId);
   const identity=snapshot.state.agentIdentities?.find(i=>i.agentId===offer.agentId),supplier=catalog.descriptors.find(s=>s.id===offer.supplierId),agent=snapshot.state.agents.find(a=>a.id===offer.agentId);
   if(!identity||!supplier||!agent)throw new Error('Prepared route has no known supplier identity.');await authorizeSupplier(this.session.client,this.session.deployment,identity,supplier);
   const expected=await makeSupplierQuoteRequest({requestId:await routeOrderRequestId(snapshot.scope,requestId,offer.agentId,offer.supplierId),workspaceHash:snapshot.scope,buyer:this.session.account,payer:this.session.deployment.vault,agentId:offer.agentId,skill:agent.skill,input:resolveSkillInput(snapshot.state,agent.skill,input.input),identity,deployment:this.session.deployment,supplier});
   await verifySupplierQuote(offer.supplierQuote,expected,supplier,Number((await this.session.client.getBlock()).timestamp));total+=offer.supplierQuote.payload.priceCents;
  }
  if(total>input.totalBudget||canonical(draft.input)!==canonical(input.input))throw new Error('Prepared route changed its input or gross budget.');
  if(input.strategy==='priority'&&canonical(draft.offers.map(o=>({agentId:o.agentId,supplierId:o.supplierId})))!==canonical(input.candidates))throw new Error('Prepared route changed the approved supplier priority.');if(input.strategy==='lowest-price'&&draft.offers.some((o,i)=>i>0&&draft.offers[i-1].supplierQuote.payload.priceCents>o.supplierQuote.payload.priceCents))throw new Error('Prepared route changed the signed price order.');return draft;
 }
 async create(draft:PurchaseRouteDraft){
  await this.session.assertSession();if(draft.buyer.toLowerCase()!==this.session.account.toLowerCase())throw new Error('Only the reviewed buyer can start this route.');
  const snapshot=await this.workspace(),agent=snapshot.state.agents.find(a=>a.id===draft.offers[0].agentId);if(!agent)throw new Error('Unknown route service.');
  const {route}=await this.request({...draft,action:'create'});
  if(canonical(route.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase()||route.workspaceHash!==snapshot.scope||canonical(purchaseRouteParameters(route))!==canonical({...draft,input:resolveSkillInput(snapshot.state,agent.skill,draft.input)}))throw new Error('Created route differs from the reviewed purchase.');return route;
 }
 async list(){return (await this.request()).routes;}
 async sync(routeId:string){return (await this.request({action:'sync',routeId})).route;}
 async resume(routeId:string){return (await this.request({action:'resume',routeId})).route;}
 async cancel(routeId:string){return (await this.request({action:'cancel',routeId})).route;}
}
