import {z} from 'zod';
import {gasUsdMicros,verifyDataFeedSnapshot,type DataFeedSnapshot,type DataFeedConfig} from './data-feeds.ts';
import {parseAbi,decodeEventLog,verifyMessage,type PublicClient} from 'viem';
import {digest,DomainError} from './engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {supplierDeliverySchema,supplierJobId,type SupplierRequest} from './supplier.ts';
import {x402Hash,type X402Policy} from './x402-policy.ts';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/),amount=z.string().regex(/^[1-9][0-9]{0,17}$/),signature=z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const paymentSchema=z.object({success:z.literal(true),transaction:x402Hash,network:z.literal('eip155:31337'),payer:address,amount,asset:address,payTo:address,blockNumber:z.string().regex(/^\d+$/),blockHash:x402Hash,blockTimestamp:z.string().regex(/^\d+$/)}).strict();
const reportSchema=z.object({terms:z.object({version:z.literal('agentos.x402-report.v1'),jobId:x402Hash,inputHash:x402Hash,paymentId:z.string().min(16).max(128),payer:address,nonce:x402Hash,output:supplierDeliverySchema.shape.payload.shape.output,outputHash:x402Hash,issuedAt:z.string().datetime()}).strict(),signature}).strict();
export const x402EvidenceSchema=z.object({terms:z.object({version:z.literal('agentos.x402-procurement-evidence.v1'),scope:x402Hash,orderId:z.string().regex(/^chain-[0-9a-f-]{36}$/),jobId:x402Hash,requestHash:x402Hash,inputHash:x402Hash,configHash:x402Hash,policyHash:x402Hash,state:z.enum(['reserved','authorized','submitted','paid','delivered','unpaid','rejected']),amount:z.string().regex(/^(0|[1-9][0-9]{0,17})$/),payer:address,asset:address,payTo:address,paymentId:z.string().min(16).max(128).optional(),nonce:x402Hash.optional(),payment:paymentSchema.optional(),report:reportSchema.optional(),gas:z.object({gasUsed:z.string().regex(/^[1-9][0-9]{0,77}$/),effectiveGasPriceWei:z.string().regex(/^(0|[1-9][0-9]{0,77})$/),costWei:z.string().regex(/^(0|[1-9][0-9]{0,77})$/),usdMicros:z.string().regex(/^(0|[1-9][0-9]{0,77})$/)}).strict().optional(),issuedAt:z.string().datetime()}).strict(),signature}).strict();
export type X402Evidence=z.infer<typeof x402EvidenceSchema>;
export const x402EvidenceMessage=(terms:X402Evidence['terms'])=>'AgentOS x402 procurement evidence v1\n'+canonical(terms);
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export async function verifyX402Evidence(raw:unknown,request:SupplierRequest,p:X402Policy){
 const e=x402EvidenceSchema.parse(raw),t=e.terms;
 if(!request.quote||t.scope!==request.quote.payload.request.workspaceHash||t.orderId!==request.orderId||t.jobId!==supplierJobId(request)||t.requestHash!==await digest(request)||t.inputHash!==request.inputHash||t.configHash!==request.supplier.configHash||t.policyHash!==await digest(p)||!same(t.asset,p.asset)||!same(t.payTo,p.payTo)||BigInt(t.amount)>BigInt(p.maxAmount)||!await verifyMessage({address:request.supplier.signer,message:x402EvidenceMessage(t),signature:e.signature as `0x${string}`}))throw new DomainError('x402 procurement evidence differs from its reviewed order.','SUPPLIER_REJECTED');
 if(t.payment&&(!t.nonce||t.payment.amount!==t.amount||!same(t.payment.payer,t.payer)||!same(t.payment.asset,t.asset)||!same(t.payment.payTo,t.payTo)))throw new DomainError('x402 payment differs from its procurement evidence.','SUPPLIER_REJECTED');
 if(t.report){const r=t.report.terms;if(!t.payment||r.jobId!==t.jobId||r.inputHash!==t.inputHash||r.nonce!==t.nonce||r.paymentId!==t.paymentId||!same(r.payer,t.payer)||r.outputHash!==await digest(r.output)||!await verifyMessage({address:p.providerSigner,message:'AgentOS x402 report v1\n'+canonical(r),signature:t.report.signature as `0x${string}`}))throw new DomainError('x402 report commitment or provider signature differs.','SUPPLIER_REJECTED');}
 if(t.gas){const snapshot=request.quote?.payload.priceSnapshot;if(!snapshot||!p.dataFeeds||BigInt(t.gas.costWei)!==BigInt(t.gas.gasUsed)*BigInt(t.gas.effectiveGasPriceWei)||BigInt(t.gas.usdMicros)!==gasUsdMicros(BigInt(t.gas.costWei),snapshot.ethUsd))throw new DomainError('Gas USD evidence differs from the signed price snapshot.','SUPPLIER_REJECTED');}
 if(t.payment&&request.quote?.payload.priceSnapshot&&!t.gas)throw new DomainError('Gas evidence is missing for the priced order.','SUPPLIER_REJECTED');
 return e;
}
const paymentABI=parseAbi(['event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)','event Transfer(address indexed from,address indexed to,uint256 value)']);
export async function verifyX402Payment(client:PublicClient,e:X402Evidence,snapshot?:DataFeedSnapshot,feeds?:DataFeedConfig){
 const t=e.terms,p=t.payment;if(!p||!t.nonce||await client.getChainId()!==31337)throw new DomainError('Confirmed local x402 procurement payment required.','SUPPLIER_REJECTED');
 const receipt=await client.getTransactionReceipt({hash:p.transaction as `0x${string}`}),block=await client.getBlock({blockNumber:receipt.blockNumber});
 const events=receipt.logs.filter(l=>same(l.address,t.asset)).flatMap(l=>{try{return [decodeEventLog({abi:paymentABI,data:l.data,topics:l.topics})];}catch{return [];}});
 if(t.gas){if(!snapshot||!feeds)throw new DomainError('Gas price snapshot is required.','SUPPLIER_REJECTED');await verifyDataFeedSnapshot(client,feeds,snapshot);if(t.gas.gasUsed!==String(receipt.gasUsed)||t.gas.effectiveGasPriceWei!==String(receipt.effectiveGasPrice)||BigInt(t.gas.costWei)!==receipt.gasUsed*receipt.effectiveGasPrice||BigInt(t.gas.usdMicros)!==gasUsdMicros(BigInt(t.gas.costWei),snapshot.ethUsd))throw new DomainError('Gas receipt or USD conversion differs.','SUPPLIER_REJECTED');}
 if(receipt.status!=='success'||block.hash!==p.blockHash||receipt.blockHash!==p.blockHash||String(receipt.blockNumber)!==p.blockNumber||String(block.timestamp)!==p.blockTimestamp||!events.some(v=>v.eventName==='AuthorizationUsed'&&same(v.args.authorizer,t.payer)&&v.args.nonce===t.nonce)||!events.some(v=>v.eventName==='Transfer'&&same(v.args.from,t.payer)&&same(v.args.to,t.payTo)&&v.args.value===BigInt(t.amount)))throw new DomainError('x402 payment is not a matching canonical transfer.','SUPPLIER_REJECTED');
}
export async function readX402Evidence(db:D1Database,owner:string,id:string){const row=await db.prepare('SELECT data FROM agentos_x402_evidence WHERE owner_id=? AND order_id=?').bind(owner,id).first<{data:string}>();return row?x402EvidenceSchema.parse(JSON.parse(row.data)):undefined;}
export async function saveX402Evidence(db:D1Database,owner:string,e:X402Evidence){
 for(let attempt=0;attempt<8;attempt++){
  const prior=await db.prepare('SELECT data FROM agentos_x402_evidence WHERE owner_id=? AND order_id=?').bind(owner,e.terms.orderId).first<{data:string}>(),data=JSON.stringify(e);
  if(prior){const old=x402EvidenceSchema.parse(JSON.parse(prior.data)).terms;if(old.jobId!==e.terms.jobId||old.requestHash!==e.terms.requestHash||old.nonce&&old.nonce!==e.terms.nonce||old.payment&&canonical(old.payment)!==canonical(e.terms.payment)||old.report&&canonical(old.report)!==canonical(e.terms.report))throw new DomainError('Existing x402 evidence cannot be replaced by another procurement.','CONFLICT');
   const r=await db.prepare('UPDATE agentos_x402_evidence SET data=?,updated_at=? WHERE owner_id=? AND order_id=? AND data=?').bind(data,Date.now(),owner,e.terms.orderId,prior.data).run();if(r.meta.changes===1)return;
  }else{const r=await db.prepare('INSERT OR IGNORE INTO agentos_x402_evidence VALUES(?,?,?,?)').bind(owner,e.terms.orderId,data,Date.now()).run();if(r.meta.changes===1)return;}
 }throw new DomainError('x402 evidence is busy; retry original order.','UNAVAILABLE');
}
