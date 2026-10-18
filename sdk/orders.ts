import type { ChainEvidence } from './chain.ts';
import { AgentWalletSession } from './wallet.ts';
import { canonical } from '../cre/workflow/verify.ts';
import { orderCommitment,type ChainOrder,type OrderDraft } from '../lib/agentos/orders.ts';
export class AgentOrderClient {
  readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
  constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
  private async post(body:unknown){const response=await fetch(this.baseURL+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const data=await response.json() as {order:ChainOrder;error?:string};if(!response.ok)throw new Error(data.error??'Onchain order request failed.');return data.order;}
  async create(input:Omit<OrderDraft,'buyer'|'requestId'|'spec'|'scenario'|'timeoutSeconds'|'model'|'agentIdentity'|'supplier'> & Partial<Pick<OrderDraft,'requestId'|'spec'|'scenario'|'timeoutSeconds'>>){
    const order=await this.post({action:'create',...input,requestId:input.requestId??crypto.randomUUID(),buyer:this.session.account});
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
