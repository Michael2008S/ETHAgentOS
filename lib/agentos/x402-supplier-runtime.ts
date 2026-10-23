import {digest,DomainError} from './engine.ts';
import {issueX402Ticket,type X402AuthorityStore} from './x402-authority.ts';
import {checkX402Policy,type X402Policy} from './x402-policy.ts';
import {verifyX402Evidence,verifyX402Payment,saveX402Evidence} from './x402-evidence.ts';
import {supplierJobId,type SupplierConfiguration,type SupplierExecutionHooks,type SupplierRequest} from './supplier.ts';
import type {PublicClient} from 'viem';
async function json(response:Response){const reader=response.body?.getReader();if(!reader)throw new DomainError('x402 supplier evidence is unavailable.','SUPPLIER_UNAVAILABLE');let size=0,text='';const decoder=new TextDecoder();try{for(;;){const p=await reader.read();if(p.done)break;if((size+=p.value.length)>131072)throw new DomainError('x402 supplier response exceeds its bound.','SUPPLIER_REJECTED');text+=decoder.decode(p.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
export async function x402SupplierPolicy(config:SupplierConfiguration,request:typeof fetch=fetch):Promise<X402Policy>{
 const response=await request(new URL('/v1/x402-policy',config.url),{redirect:'manual',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new DomainError('Reviewed x402 supplier policy is unavailable.','SUPPLIER_UNAVAILABLE');return checkX402Policy(await json(response),config.revision);
}
export function x402SupplierHooks(store:X402AuthorityStore,config:SupplierConfiguration,policy:X402Policy,origin:string,client:PublicClient,request:typeof fetch=fetch):SupplierExecutionHooks{
 const tickets=new WeakMap<SupplierRequest,{token:string;owner:string}>();
 return {async before(body,context){
  if(!context||!body.quote||context.order.x402Review?.policyHash!=='0x'+config.revision.slice(8)||!context.order.x402Review.discloseInput)throw new DomainError('Review the x402 policy and input disclosure before procurement.','SUPPLIER_REJECTED');
  const ticket=await issueX402Ticket(store,context.ownerId,context.order,origin);tickets.set(body,{token:ticket.token,owner:context.ownerId});return {'x-agentos-x402-ticket':ticket.token};
 },async after(body,_context,delivery){
  const ticket=tickets.get(body);if(!ticket)throw new DomainError('x402 execution ticket unavailable.','SUPPLIER_REJECTED');
  const response=await request(new URL('/v1/x402-evidence',config.url),{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','x-agentos-x402-ticket':ticket.token},body:JSON.stringify({jobId:supplierJobId(body),requestHash:await digest(body)}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new DomainError('Original x402 procurement evidence awaits recovery.','SUPPLIER_UNAVAILABLE');
  const evidence=await verifyX402Evidence(await json(response),body,policy);if(evidence.terms.payment)await verifyX402Payment(client,evidence,body.quote?.payload.priceSnapshot,policy.dataFeeds);await saveX402Evidence(store.database,ticket.owner,evidence);
  if(delivery&&(!evidence.terms.payment||!evidence.terms.report||evidence.terms.report.terms.outputHash!==delivery.payload.outputHash))throw new DomainError('Supplier delivery has no matching paid x402 report.','SUPPLIER_REJECTED');
 }};
}
