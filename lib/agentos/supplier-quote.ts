import {z} from 'zod';
import {verifyMessage,type Address,type Hex} from 'viem';
import {canonical,deliveryVerification,resultHash} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {skillIdSchema} from './skill-schema.ts';
import type {TaskInput,Skill} from './types.ts';
import type {AgentIdentity} from './identity.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {SupplierDescriptor} from './supplier.ts';
import type {ChainOrder} from './orders.ts';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(s=>!/^0x0{40}$/.test(s)).transform(s=>s.toLowerCase() as Address),hash=z.string().regex(/^0x[0-9a-f]{64}$/).transform(s=>s as Hex),integer=z.number().int().positive().safe();
export const supplierQuoteRequestSchema=z.object({version:z.literal('agentos.skill-quote-request.v1'),requestId:z.string().uuid(),workspaceHash:hash,buyer:address,payer:address,chainId:integer,escrow:address,token:address,agentId:z.string().min(1).max(128),skill:skillIdSchema,inputHash:hash,verificationHash:hash,registry:address,registryAgentId:z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v=>BigInt(v)<2n**256n),identityOwner:address,seller:address,documentHash:hash,supplierId:z.string().regex(/^[a-z0-9-]{1,64}$/),configHash:hash}).strict();
export type SupplierQuoteRequest=z.infer<typeof supplierQuoteRequestSchema>;
export const supplierQuoteSchema=z.object({payload:z.object({version:z.literal('agentos.skill-quote.v1'),request:supplierQuoteRequestSchema,priceCents:integer.max(1000000),issuedAt:integer,expiresAt:integer}).strict(),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(v=>v as Hex)}).strict();
export type SupplierQuote=z.infer<typeof supplierQuoteSchema>;
export const supplierQuoteMessage=(payload:SupplierQuote['payload'])=>'AgentOS supplier quote v1\n'+canonical(payload);
export const supplierQuoteRequestKey=(request:SupplierQuoteRequest)=>'quote-'+resultHash(request);
export const supplierQuoteHash=(quote:SupplierQuote)=>resultHash(quote);
export function assertQuoteTime(quote:SupplierQuote,now:number){
 const p=quote.payload;if(!Number.isSafeInteger(now)||p.issuedAt>now||p.expiresAt<=now)throw new DomainError('Supplier quote is not currently valid. Request a new quote.','FORBIDDEN');
}
export async function makeSupplierQuoteRequest(context:{requestId:string;workspaceHash:string;buyer:Address;payer:Address;agentId:string;skill:Skill;input:TaskInput;identity:AgentIdentity;deployment:WalletDeployment;supplier:SupplierDescriptor}):Promise<SupplierQuoteRequest>{
 const {identity,deployment,supplier}=context;
 return supplierQuoteRequestSchema.parse({version:'agentos.skill-quote-request.v1',requestId:context.requestId,workspaceHash:context.workspaceHash,buyer:context.buyer,payer:context.payer,chainId:deployment.chainId,escrow:deployment.escrow,token:deployment.token,agentId:context.agentId,skill:context.skill,inputHash:await digest(context.input),verificationHash:resultHash(deliveryVerification(context.skill,context.input)),registry:identity.registry,registryAgentId:identity.registryAgentId,identityOwner:identity.owner,seller:identity.wallet,documentHash:identity.documentHash,supplierId:supplier.id,configHash:supplier.configHash});
}
export async function verifySupplierQuote(raw:unknown,request:SupplierQuoteRequest,descriptor:SupplierDescriptor,now?:number):Promise<SupplierQuote>{
 let quote:SupplierQuote;try{quote=supplierQuoteSchema.parse(raw);}catch{throw new DomainError('Invalid signed supplier quote.','SUPPLIER_REJECTED');}
 const p=quote.payload;
 if(p.expiresAt<=p.issuedAt||p.expiresAt-p.issuedAt>86400||canonical(p.request)!==canonical(supplierQuoteRequestSchema.parse(request))||p.request.supplierId!==descriptor.id||p.request.configHash!==descriptor.configHash||!descriptor.skills.includes(p.request.skill)||!await verifyMessage({address:descriptor.signer,message:supplierQuoteMessage(p),signature:quote.signature}).catch(()=>false))throw new DomainError('Supplier quote signature or purchase commitment differs.','SUPPLIER_REJECTED');
 if(now!==undefined)assertQuoteTime(quote,now);return quote;
}
export async function verifyOrderQuote(order:Pick<ChainOrder,'supplierQuote'|'requestId'|'agentId'|'skill'|'input'|'buyer'|'deployment'|'supplier'|'agentIdentity'|'vault'|'quote'|'executor'>,now?:number,workspaceHash?:string){
 if(!order.supplierQuote)return;
 if(order.executor!=='supplier'||!order.supplier||!order.agentIdentity)throw new DomainError('A quote requires its identity-bound supplier.','SUPPLIER_REJECTED');
 const expected=await makeSupplierQuoteRequest({requestId:order.requestId,workspaceHash:workspaceHash??order.supplierQuote.payload.request.workspaceHash,buyer:order.buyer,payer:order.vault?.vault??order.buyer,agentId:order.agentId,skill:order.skill,input:order.input,identity:order.agentIdentity,deployment:order.deployment,supplier:order.supplier});
 const quote=await verifySupplierQuote(order.supplierQuote,expected,order.supplier,now);
 if(quote.payload.priceCents!==order.quote)throw new DomainError('Order price differs from the signed supplier quote.','SUPPLIER_REJECTED');
}
