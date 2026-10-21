import type {Address,Hex} from 'viem';
import {validateVerification,type DeliverySpec} from './verify.ts';
export const READY_LIMIT=64,BATCH_SIZE=2,SLOT_MILLISECONDS=30000;
export type DispatcherConfig={mode:'dispatcher';schedule:string;chainName:'ethereum-testnet-sepolia';escrowAddress:Address;gasLimit:string;evidenceOrigin:string};
export type ReadyItem={taskId:Hex;spec:DeliverySpec};
export type ReadyBatch={version:'agentos.ready.v1';chainId:11155111;escrow:Address;slot:number;total:number;indexHash:Hex;items:ReadyItem[]};
export const evidenceRoot=(origin:string,escrow:string)=>origin+'/v1/11155111/'+escrow.toLowerCase();
const hash=(v:unknown):v is Hex=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)&&!/^0x0+$/.test(v);
export function validateReadyIds(value:unknown):asserts value is Hex[]{
 if(!Array.isArray(value)||value.length>READY_LIMIT||value.some((id,i)=>!hash(id)||i>0&&id<=value[i-1]))throw new Error('Invalid bounded ready index');
}
export function selectReadyIds(ids:Hex[],slot:number){
 validateReadyIds(ids);if(!Number.isSafeInteger(slot)||slot<0)throw new Error('Invalid dispatcher slot');
 const start=ids.length?(slot%Math.ceil(ids.length/BATCH_SIZE))*BATCH_SIZE:0;return ids.slice(start,start+BATCH_SIZE);
}
/** Feed availability is trusted, but every selected specification is separately checked onchain. */
export function validateReadyBatch(raw:unknown,config:DispatcherConfig,slot:number):ReadyBatch{
 const b=raw as ReadyBatch,root=evidenceRoot(config.evidenceOrigin,config.escrowAddress);
 if(!b||Object.keys(b).sort().join(',')!=='chainId,escrow,indexHash,items,slot,total,version'||b.version!=='agentos.ready.v1'||b.chainId!==11155111||b.escrow!==config.escrowAddress.toLowerCase()||b.slot!==slot||!hash(b.indexHash)||!Number.isSafeInteger(b.total)||b.total<0||b.total>READY_LIMIT||!Array.isArray(b.items)||b.items.length>BATCH_SIZE||b.items.length>b.total||Boolean(b.total)!==Boolean(b.items.length))throw new Error('Invalid dispatcher batch');
 const seen=new Set<string>();
 for(const item of b.items){
  if(!item||Object.keys(item).sort().join(',')!=='spec,taskId'||!hash(item.taskId)||seen.has(item.taskId)||!item.spec||Object.keys(item.spec).sort().join(',')!=='artifactUrl,datasetHash,datasetUrl,verification'||!hash(item.spec.datasetHash)||item.spec.datasetUrl!==root+'/dataset/'+item.spec.datasetHash||item.spec.artifactUrl!==root+'/artifact/'+item.taskId)throw new Error('Dispatcher evidence escapes the configured commitment scope');
  validateVerification(item.spec.verification);seen.add(item.taskId);
 }
 return b;
}
