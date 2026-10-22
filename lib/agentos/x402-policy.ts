import {z} from 'zod';
import {digest,DomainError,normalizeInput} from './engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {transferSourceSchema} from './transfer-source.ts';

export const x402Hash=z.string().regex(/^0x[0-9a-f]{64}$/);
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v=>!/^0x0{40}$/.test(v)).transform(v=>v.toLowerCase() as `0x${string}`);
const amount=z.string().regex(/^[1-9][0-9]{0,17}$/);
const origin=z.string().refine(v=>{try{const u=new URL(v);return u.origin===v&&u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!u.username&&!u.password;}catch{return false;}},'A fixed local development origin is required.');
export const x402PolicySchema=z.object({
 version:z.literal('agentos.x402-supplier-policy.v1'),
 upstreamOrigin:origin,facilitatorOrigin:origin,path:z.literal('/v1/treasury-report'),
 network:z.literal('eip155:31337'),asset:address,payTo:address,providerSigner:address,
 name:z.literal('DemoUSDC'),domainVersion:z.literal('1'),decimals:z.literal(6),
 maxAmount:amount,dailyAmount:amount,authorizationSeconds:z.number().int().min(10).max(60),
 maxAuthorizations:z.literal(1),maxTransportRetries:z.number().int().min(1).max(3),
 refundLiability:z.literal('supplier'),inputDisclosure:z.literal('reviewed-input-to-configured-provider'),
}).strict().refine(v=>BigInt(v.dailyAmount)>=BigInt(v.maxAmount),'Daily procurement cap must cover one purchase.');
export type X402Policy=z.infer<typeof x402PolicySchema>;
export const x402PolicyHash=async(p:X402Policy)=>digest(x402PolicySchema.parse(p));
export const x402Revision=async(p:X402Policy)=>'x402-v1-'+(await x402PolicyHash(p)).slice(2);
export const isX402Supplier=(s:{revision:string})=>/^x402-v1-[0-9a-f]{64}$/.test(s.revision);
export async function checkX402Policy(raw:unknown,revision:string){const p=x402PolicySchema.parse(raw);if(await x402Revision(p)!==revision)throw new DomainError('x402 supplier policy changed. Review its new revision.','SUPPLIER_REJECTED');return p;}

export const x402RequirementsSchema=z.object({scheme:z.literal('exact'),network:z.literal('eip155:31337'),amount,asset:address,payTo:address,maxTimeoutSeconds:z.number().int().min(10).max(60),extra:z.object({name:z.literal('DemoUSDC'),version:z.literal('1'),assetTransferMethod:z.literal('eip3009')}).strict()}).strict();
export function checkX402Requirements(raw:unknown,p:X402Policy){
 const r=x402RequirementsSchema.parse(raw);
 if(r.asset!==p.asset||r.payTo!==p.payTo||r.network!==p.network||BigInt(r.amount)>BigInt(p.maxAmount)||r.maxTimeoutSeconds>p.authorizationSeconds)throw new DomainError('x402 price, destination or network exceeds the reviewed policy.','SUPPLIER_REJECTED');
 return r;
}
const record=z.object({block:z.number().int().nonnegative().safe(),from:z.string().min(1).max(128),to:z.string().min(1).max(128),cents:z.number().int().nonnegative().safe()}).strict();
export const x402ReportRequestSchema=z.object({version:z.literal('agentos.x402-report-request.v1'),jobId:x402Hash,inputHash:x402Hash,input:z.object({dataset:z.literal('custom-transfers-v1'),blockFrom:z.number().int().nonnegative().safe(),blockTo:z.number().int().nonnegative().safe(),records:z.array(record).min(1).max(100),source:transferSourceSchema.optional()}).strict()}).strict();
export async function checkX402ReportRequest(raw:unknown){const r=x402ReportRequestSchema.parse(raw),input=normalizeInput(r.input);if(canonical(input)!==canonical(r.input)||await digest(input)!==r.inputHash)throw new DomainError('x402 report input commitment differs.','SUPPLIER_REJECTED');return r;}

/** SDK signer guard: check what will actually be signed, not only the 402 description. */
export function checkX402TypedData(raw:{domain:Record<string,unknown>;primaryType:string;message:Record<string,unknown>},p:X402Policy,payer:string,expectedAmount:string,now=Date.now()){
 const d=raw.domain,m=raw.message;
 if(raw.primaryType!=='TransferWithAuthorization'||d.name!==p.name||d.version!==p.domainVersion||Number(d.chainId)!==31337||String(d.verifyingContract).toLowerCase()!==p.asset||String(m.from).toLowerCase()!==payer.toLowerCase()||String(m.to).toLowerCase()!==p.payTo||String(m.value)!==expectedAmount||!x402Hash.safeParse(m.nonce).success||BigInt(String(m.validAfter))>BigInt(Math.floor(now/1000))||BigInt(String(m.validBefore))<=BigInt(Math.floor(now/1000))||BigInt(String(m.validBefore))>BigInt(Math.floor(now/1000)+p.authorizationSeconds))throw new DomainError('x402 signing intent differs from the reviewed procurement.','SUPPLIER_REJECTED');
}
