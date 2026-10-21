import {makeSupplierQuoteRequest,verifySupplierQuote,verifyOrderQuote,type SupplierQuote} from '../lib/agentos/supplier-quote.ts';
import {resolveSkillInput} from '../lib/agentos/engine.ts';
import {authorizeSupplier} from '../lib/agentos/supplier-chain.ts';
import type {SupplierDescriptor} from '../lib/agentos/supplier.ts';
import type {AgentIdentity} from '../lib/agentos/identity.ts';
import type {TaskInput,Workspace} from '../lib/agentos/types.ts';
import type { ChainEvidence } from './chain.ts';
import { AgentWalletSession } from './wallet.ts';
import { canonical } from '../cre/workflow/verify.ts';
import { orderCommitment,type ChainOrder,type OrderDraft } from '../lib/agentos/orders.ts';
export class AgentOrderClient {
  readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
  constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
  private async post(body:unknown){const response=await fetch(this.baseURL+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const data=await response.json() as {order:ChainOrder;error?:string};if(!response.ok)throw new Error(data.error??'Onchain order request failed.');return data.order;}
  async quote(input:{requestId:string;agentId:string;supplierId:string;input?:TaskInput;vaultSessionId?:string}):Promise<SupplierQuote>{
    await this.session.assertSession();const snapshotResponse=await fetch(this.baseURL+'/api/workspace',{headers:this.headers,credentials:'include',cache:'no-store'}),snapshot=await snapshotResponse.json() as {state:Workspace;scope:string};if(!snapshotResponse.ok)throw new Error('Workspace unavailable.');
    const agent=snapshot.state.agents.find(a=>a.id===input.agentId);if(!agent)throw new Error('Unknown service.');
    const response=await fetch(this.baseURL+'/api/quotes',{method:'POST',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',body:JSON.stringify({...input,buyer:this.session.account}),signal:AbortSignal.timeout(60000)}),data=await response.json() as {quote:SupplierQuote;supplier:SupplierDescriptor;identity:AgentIdentity;scope:string;error?:string};if(!response.ok)throw new Error(data.error??'Supplier quote service is unavailable.');
    if(data.scope!==snapshot.scope||data.supplier.id!==input.supplierId)throw new Error('Supplier quote differs from this workspace or provider.');
    await authorizeSupplier(this.session.client,this.session.deployment,data.identity,data.supplier);
    const expected=await makeSupplierQuoteRequest({requestId:input.requestId,workspaceHash:snapshot.scope,buyer:this.session.account,payer:input.vaultSessionId?this.session.deployment.vault!:this.session.account,agentId:input.agentId,skill:agent.skill,input:resolveSkillInput(snapshot.state,agent.skill,input.input),identity:data.identity,deployment:this.session.deployment,supplier:data.supplier});
    return verifySupplierQuote(data.quote,expected,data.supplier,Number((await this.session.client.getBlock()).timestamp));
  }
  async create(input:Omit<OrderDraft,'workflowId'|'buyer'|'requestId'|'spec'|'scenario'|'timeoutSeconds'|'model'|'agentIdentity'|'supplier'> & Partial<Pick<OrderDraft,'requestId'|'spec'|'scenario'|'timeoutSeconds'>> & {supplierId?:string}){
    const requestId=input.requestId??crypto.randomUUID(),order=await this.post({action:'create',...input,requestId,buyer:this.session.account});
    if(input.supplierQuote&&canonical(order.supplierQuote)!==canonical(input.supplierQuote))throw new Error('Server order changed the approved signed quote.');
    if(order.supplierQuote){if(order.requestId!==requestId||order.agentId!==input.agentId||order.quote>input.budget||order.budget!==input.budget||input.supplierId&&order.supplier?.id!==input.supplierId)throw new Error('Quoted order differs from the approved purchase.');await verifyOrderQuote(order);}
    if(canonical(order.deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase()||order.buyer.toLowerCase()!==this.session.account.toLowerCase())throw new Error('Server order differs from the connected wallet deployment.');return order;
  }
  async activate(order:ChainOrder,funding:ChainEvidence){
    const challenged=await this.post({action:'challenge',orderId:order.id,transactionHash:funding.transactionHash}),auth=challenged.authorization;
    if(!auth||await orderCommitment(challenged)!==await orderCommitment(order)||!auth.message.includes(`Commitment: ${await orderCommitment(order)}`)||!auth.message.includes(`Transaction: ${funding.transactionHash}`)||!auth.message.includes(`Nonce: ${auth.nonce}`))throw new Error('Order authorization differs from the approved input and escrow.');
    return this.post({action:'activate',orderId:order.id,nonce:auth.nonce,signature:await this.session.signReconciliation(auth.message)});
  }
  async orders(){const r=await fetch(this.baseURL+'/api/orders',{headers:this.headers,credentials:'include',cache:'no-store'});const b=await r.json() as {orders:ChainOrder[];error?:string};if(!r.ok)throw new Error(b.error??'Unable to read orders.');return b.orders;}
  async wait(id:string,timeoutMs=45000){const end=Date.now()+timeoutMs;while(Date.now()<end){const order=(await this.orders()).find(o=>o.id===id);if(!order)throw new Error('Onchain order not found.');if(['completed','refunded','paused','cancelled'].includes(order.status))return order;await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Order checkpoint retained; waiting for server or chain confirmation.');}
  async sync(orderId:string,transactionHash?:`0x${string}`){return this.post({action:'sync',orderId,transactionHash});}
  async cancel(orderId:string){return this.post({action:'cancel',orderId});}
  async resume(orderId:string){return this.post({action:'resume',orderId});}
}
