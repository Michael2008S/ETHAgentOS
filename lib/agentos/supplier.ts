import {orderSeller} from './order-parties.ts';
import {skillIdSchema,skillDefinitionSchema,deliveryVerificationSchema} from './skill-schema.ts';
import {acceptedArtifactSchema} from './artifact-memory.ts';
import {transferSourceSchema,sourceSummarySchema} from './transfer-source.ts';
import { z } from 'zod';
import { encodeAbiParameters,keccak256,parseAbiParameters,stringToHex,verifyMessage,type Address,type Hex } from 'viem';
import { canonical,specHash } from '../../cre/workflow/verify.ts';
import { digest,DomainError,normalizeInput } from './engine.ts';
import { inputEvidence } from '../../sdk/wallet.ts';
import type { ChainOrder } from './orders.ts';
import type { Skill } from './types.ts';

const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(s=>!/^0x0{40}$/.test(s)).transform(s=>s.toLowerCase() as Address),hash=z.string().regex(/^0x[0-9a-f]{64}$/).transform(s=>s as Hex),integer=z.number().int().nonnegative().safe(),skill=skillIdSchema;
const configSchema=z.object({url:z.string().max(4096),id:z.string().regex(/^[a-z0-9-]{1,64}$/),name:z.string().min(1).max(80),revision:z.string().min(1).max(80),signer:address,skills:z.array(skill).min(1).max(22).refine(v=>new Set(v).size===v.length),timeoutMs:z.number().int().min(1000).max(60000).default(30000)}).strict();
export type SupplierConfiguration=z.infer<typeof configSchema>;
export type SupplierDescriptor={id:string;name:string;revision:string;signer:Address;skills:Skill[];configHash:Hex};
const descriptorSchema=z.object({id:z.string().max(64),name:z.string().max(80),revision:z.string().max(80),signer:address,skills:z.array(skill).min(1).max(22),configHash:hash}).strict();
export const SUPPLIER_METADATA_KEY='agentos.supplier.v1';
export const supplierMetadata=(descriptor:SupplierDescriptor)=>encodeAbiParameters(parseAbiParameters('address,bytes32'),[descriptor.signer,descriptor.configHash]);
export function parseSupplierConfiguration(raw:unknown,allowLocal=false):SupplierConfiguration{
 let config:SupplierConfiguration;try{config=configSchema.parse(raw);}catch{throw new DomainError('Invalid supplier configuration.','UNAVAILABLE');}
 let url:URL;try{url=new URL(config.url);}catch{throw new DomainError('Invalid supplier endpoint.','UNAVAILABLE');}
 if(url.username||url.password||url.hash||url.search||url.pathname!=='/v1/execute'||!(url.protocol==='https:'||allowLocal&&url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new DomainError('Supplier endpoint requires configured HTTPS or the development loopback service.','UNAVAILABLE');
 return {...config,url:url.href};
}
export async function supplierDescriptor(config:SupplierConfiguration):Promise<SupplierDescriptor>{return {id:config.id,name:config.name,revision:config.revision,signer:config.signer,skills:config.skills,configHash:await digest({version:1,...config}) as Hex};}
const inputSchema=z.object({skillDefinition:skillDefinitionSchema.optional(),dataset:z.enum(['eth-shenzhen-fixture-v1','custom-transfers-v1']),blockFrom:integer,blockTo:integer,source:transferSourceSchema.optional(),memory:z.lazy(()=>acceptedArtifactSchema).optional(),records:z.array(z.object({block:integer,from:z.string().min(1).max(128),to:z.string().min(1).max(128),cents:integer}).strict()).min(1).max(100).optional()}).strict();
export const supplierRequestSchema=z.object({version:z.literal('agentos.skill-request.v1'),orderId:z.string().min(1).max(128),taskId:hash,chainId:z.number().int().positive().safe(),escrow:address,buyer:address,paymentBuyer:address.optional(),seller:address,quoteCents:z.number().int().positive().safe(),chainDeadline:z.string().regex(/^\d{1,20}$/),fundingTransactionHash:hash,scenario:z.enum(['success','injection','invalid-delivery','interruption']),skill,input:inputSchema,inputHash:hash,spec:z.object({datasetUrl:z.string().max(4096),artifactUrl:z.string().max(4096),datasetHash:hash,verification:deliveryVerificationSchema.optional()}).strict(),identity:z.object({registry:address,registryAgentId:z.string().regex(/^(0|[1-9][0-9]{0,77})$/),owner:address,wallet:address,documentHash:hash}).strict(),operations:z.tuple([z.literal('dataset.read'),z.literal('artifact.write')]),supplier:descriptorSchema}).strict();
export type SupplierRequest=z.infer<typeof supplierRequestSchema>;
export const supplierJobId=(request:SupplierRequest)=>keccak256(stringToHex(canonical({version:1,chainId:request.chainId,escrow:request.escrow,taskId:request.taskId,supplier:request.supplier.configHash})));
export async function supplierRequest(order:ChainOrder):Promise<SupplierRequest>{
 if(!order.funding||!order.supplier||!order.agentIdentity||!order.chainDeadline)throw new DomainError('Supplier execution requires verified funding and an authorized identity.','SUPPLIER_REJECTED');
 const identity=order.agentIdentity,request=supplierRequestSchema.parse({version:'agentos.skill-request.v1',orderId:order.id,taskId:inputEvidence(order,order.buyer).id,chainId:order.deployment.chainId,escrow:order.deployment.escrow,buyer:order.buyer,...(order.vault?{paymentBuyer:order.vault.vault}:{}),seller:orderSeller(order),quoteCents:order.quote,chainDeadline:order.chainDeadline,fundingTransactionHash:order.funding.transactionHash,scenario:order.scenario,skill:order.skill,input:order.input,inputHash:order.inputHash,spec:order.spec,identity:{registry:identity.registry,registryAgentId:identity.registryAgentId,owner:identity.owner,wallet:identity.wallet,documentHash:identity.documentHash},operations:['dataset.read','artifact.write'],supplier:order.supplier});
 if(await digest(normalizeInput(request.input))!==request.inputHash)throw new DomainError('Supplier input commitment differs.','SUPPLIER_REJECTED');return request;
}
const outputBase={source:sourceSummarySchema.optional(),dataset:z.string().max(64),blockFrom:integer,blockTo:integer,transferCount:integer,totalCents:integer};
export const supplierDeliverySchema=z.object({payload:z.object({version:z.literal('agentos.skill-delivery.v1'),requestHash:hash,configHash:hash,jobId:hash,outputHash:hash,output:z.union([z.object({...outputBase,uniqueRecipients:integer}).strict(),z.object({...outputBase,allocations:z.record(integer)}).strict(),z.object({...outputBase,groupBy:z.enum(['from','to']),accountCount:integer,topAccounts:z.array(z.object({account:z.string().min(1).max(128),amountCents:integer,shareBps:integer.max(10000)}).strict()).max(10),thresholdBps:integer.max(10000),concentrated:z.boolean()}).strict()]),issuedAt:z.string().datetime()}).strict(),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(v=>v as Hex)}).strict();
export type SupplierDelivery=z.infer<typeof supplierDeliverySchema>;
export const supplierReceiptMessage=(payload:SupplierDelivery['payload'])=>'AgentOS skill delivery v1\n'+canonical(payload);
export async function verifySupplierDelivery(raw:unknown,request:SupplierRequest):Promise<SupplierDelivery>{
 let delivery:SupplierDelivery;try{delivery=supplierDeliverySchema.parse(raw);}catch{throw new DomainError('Supplier returned an invalid delivery envelope.','SUPPLIER_REJECTED');}
 const p=delivery.payload;
 if(p.requestHash!==await digest(request)||p.configHash!==request.supplier.configHash||p.jobId!==supplierJobId(request)||p.outputHash!==await digest(p.output)||!await verifyMessage({address:request.supplier.signer,message:supplierReceiptMessage(p),signature:delivery.signature}).catch(()=>false))throw new DomainError('Supplier delivery signature or commitment differs from the authorized request.','SUPPLIER_REJECTED');
 return delivery;
}
export type OrderSupplier={descriptor:SupplierDescriptor;execute(request:SupplierRequest):Promise<SupplierDelivery>;authorize(order:ChainOrder):Promise<void>};
export async function createSupplier(config:SupplierConfiguration,authorize:OrderSupplier['authorize'],apiKey?:string,request:typeof fetch=fetch):Promise<OrderSupplier>{
 const descriptor=await supplierDescriptor(config);
 return {descriptor,authorize,async execute(body){
  if(canonical(body.supplier)!==canonical(descriptor))throw new DomainError('Supplier configuration differs from the authorized order.','SUPPLIER_REJECTED');
  let response:Response;try{response=await request(config.url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','Idempotency-Key':supplierJobId(body),...(apiKey?{Authorization:'Bearer '+apiKey}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(config.timeoutMs)});}catch{throw new DomainError('Supplier is temporarily unavailable. The execution checkpoint is retained.','SUPPLIER_UNAVAILABLE');}
  if(!response.ok){await response.body?.cancel();if(response.status===409)throw new DomainError('Supplier rejected a conflicting request commitment.','SUPPLIER_REJECTED');if(response.status>=500||response.status===429)throw new DomainError('Supplier is temporarily unavailable. The execution checkpoint is retained.','SUPPLIER_UNAVAILABLE');throw new DomainError('Supplier rejected the execution request.','SUPPLIER_REJECTED');}
  const reader=response.body?.getReader();if(!reader)throw new DomainError('Supplier returned an empty delivery.','SUPPLIER_REJECTED');let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new DomainError('Supplier delivery exceeds the size limit.','SUPPLIER_REJECTED');}chunks.push(value);}}finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}let value:unknown;try{value=JSON.parse(new TextDecoder().decode(raw));}catch{throw new DomainError('Supplier returned malformed JSON.','SUPPLIER_REJECTED');}return verifySupplierDelivery(value,body);
 }};
}
