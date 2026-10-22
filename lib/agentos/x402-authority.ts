import {z} from 'zod';
import {digest,DomainError} from './engine.ts';
import {findOrder,orderPolicy,type ChainOrder} from './orders.ts';
import {supplierRequest,supplierJobId} from './supplier.ts';
import {sessionBinding,vaultAllowance,assertVaultSeller} from './vault.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {isX402Supplier,x402Hash} from './x402-policy.ts';
import type {Workspace} from './types.ts';

type Snapshot={state:Workspace;revision:number};
export type X402AuthorityStore={database:D1Database;read:(owner:string)=>Promise<Snapshot>};
export const x402AuthorizationSchema=z.object({action:z.enum(['preflight','commit']),jobId:x402Hash,nonce:x402Hash.optional(),intentHash:x402Hash.optional()}).strict().refine(v=>v.action==='commit'?!!v.nonce&&!!v.intentHash:!v.nonce&&!v.intentHash);
type Ticket={token_hash:string;owner_id:string;order_id:string;lease_hash:string;request_hash:string;expires_at:number};
const deny=()=>new DomainError('Current x402 procurement authority is unavailable.','FORBIDDEN');
export function x402OrderAuthority(state:Workspace,id:string,now=Date.now()){
 const o=findOrder(state,id),iso=new Date(now).toISOString();
 if(o.status!=='running'||o.step!==2||!o.funding||!o.vault||!o.supplier||!o.agentIdentity||!o.x402Review?.discloseInput||o.x402Review.policyHash!=='0x'+o.supplier.revision.slice(8)||!isX402Supplier(o.supplier)||!o.supplierLease||o.supplierLease.expiresAt<=iso||o.settlementAuthorization||o.failure||o.deadlineAt&&o.deadlineAt<=iso||orderPolicy(state,o,iso))throw deny();
 const session=vaultAllowance(state,o.vault.sessionId,o.buyer,o.skill,o.budget,0,iso,o.id);
 if(canonical(sessionBinding(session))!==canonical(o.vault))throw deny();
 assertVaultSeller(session,o.agentIdentity!.wallet);return o;
}
export async function issueX402Ticket(store:X402AuthorityStore,owner:string,order:ChainOrder,origin:string){
 const url=new URL(origin);if(url.origin!==origin||url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw deny();
 const s=await store.read(owner),current=x402OrderAuthority(s.state,order.id);
 if(current.supplierLease!.token!==order.supplierLease?.token)throw deny();
 const token='x402_'+crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),hash=await digest(token),leaseHash=await digest(current.supplierLease!.token),requestHash=await digest(await supplierRequest(current)),expires=Math.min(Date.parse(current.supplierLease!.expiresAt),Date.now()+60000);
 await store.database.prepare('DELETE FROM agentos_x402_tickets WHERE owner_id=? AND expires_at<=?').bind(owner,Date.now()).run();
 const result=await store.database.prepare('INSERT INTO agentos_x402_tickets SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM agentos_workspaces WHERE owner_id=? AND revision=?)').bind(hash,owner,current.id,leaseHash,requestHash,expires,owner,s.revision).run();
 if(result.meta.changes!==1)throw new DomainError('x402 execution lease changed; retry the same order.','UNAVAILABLE');
 return {token,callback:origin+'/api/runtime/x402-authorize'};
}
export async function authorizeX402(store:X402AuthorityStore,token:string,raw:unknown,checkChain:(order:ChainOrder)=>Promise<void>,now=Date.now()){
 if(!/^x402_[0-9a-f]{64}$/.test(token))throw deny();const body=x402AuthorizationSchema.parse(raw),row=await store.database.prepare('SELECT * FROM agentos_x402_tickets WHERE token_hash=?').bind(await digest(token)).first<Ticket>();
 if(!row||row.expires_at<=now)throw deny();
 const initial=await store.read(row.owner_id),order=x402OrderAuthority(initial.state,row.order_id,now),request=await supplierRequest(order);
 if(await digest(order.supplierLease!.token)!==row.lease_hash||await digest(request)!==row.request_hash||supplierJobId(request)!==body.jobId)throw deny();
 await checkChain(order);
 const current=await store.read(row.owner_id),fresh=x402OrderAuthority(current.state,row.order_id,Date.now());
 if(await digest(fresh.supplierLease!.token)!==row.lease_hash||await digest(await supplierRequest(fresh))!==row.request_hash||row.expires_at<=Date.now())throw deny();
 if(body.action==='commit'){
  const result=await store.database.prepare('INSERT INTO agentos_x402_intents SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM agentos_workspaces WHERE owner_id=? AND revision=?) ON CONFLICT(owner_id,order_id) DO UPDATE SET touched_at=excluded.touched_at WHERE intent_hash=excluded.intent_hash AND nonce=excluded.nonce').bind(row.owner_id,row.order_id,body.intentHash!,body.nonce!,Date.now(),row.owner_id,current.revision).run();
  if(result.meta.changes!==1)throw new DomainError('An x402 order cannot authorize a replacement payment intent.','FORBIDDEN');
 }
 return {authorized:true,scope:await digest({workspace:row.owner_id}),orderId:row.order_id,expiresAt:new Date(row.expires_at).toISOString()};
}
