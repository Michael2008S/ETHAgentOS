import {keccak256,stringToHex,type Hex} from 'viem';
import {assertSourceInput,sourceCommitment,sourceSummary,type TransferSource} from '../../lib/agentos/transfer-source.ts';
export type DeliveryVerification={version:'agentos.delivery.v2';skill:'event-analysis'|'treasury-report';skillVersion:'1.0.0';dataset:string;blockFrom:number;blockTo:number;sourceHash?:Hex};
// Optional only for historical v1 commitments. New purchases require v2.
export type DeliverySpec={datasetUrl:string;datasetHash:Hex;artifactUrl:string;verification?:DeliveryVerification};
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export const specHash=(spec:DeliverySpec)=>keccak256(stringToHex(canonical(spec)));
export const resultHash=(output:unknown)=>keccak256(stringToHex(canonical(output)));
export function deliveryVerification(skill:DeliveryVerification['skill'],input:{dataset:string;blockFrom:number;blockTo:number;source?:TransferSource}):DeliveryVerification{
 return {version:'agentos.delivery.v2',skill,skillVersion:'1.0.0',dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,...(input.source?{sourceHash:sourceCommitment(input.source)}:{})};
}
export function validateVerification(value:unknown):asserts value is DeliveryVerification{
 const v=value as DeliveryVerification;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==(v.sourceHash===undefined?'blockFrom,blockTo,dataset,skill,skillVersion,version':'blockFrom,blockTo,dataset,skill,skillVersion,sourceHash,version')||v.sourceHash!==undefined&&!/^0x[0-9a-f]{64}$/.test(v.sourceHash)||v.version!=='agentos.delivery.v2'||!['event-analysis','treasury-report'].includes(v.skill)||v.skillVersion!=='1.0.0'||!['eth-shenzhen-fixture-v1','custom-transfers-v1'].includes(v.dataset)||!Number.isSafeInteger(v.blockFrom)||v.blockFrom<0||!Number.isSafeInteger(v.blockTo)||v.blockTo<v.blockFrom)throw new Error('Invalid versioned delivery verification');
}
export function deliveryArtifact(taskId:Hex,verification:DeliveryVerification,datasetHash:Hex,output:unknown){
 return {version:'agentos.delivery.v2',taskId,verification,datasetHash,output,outputHash:resultHash(output)};
}
/** Independently computes the full skill result; does not import runtime adapters. */
function recompute(rows:unknown[],v:DeliveryVerification){
 let total=0n;const recipients=new Map<string,bigint>();
 for(const raw of rows){
  const row=raw as {block:number;from:string;to:string;cents:number};
  if(!row||Object.keys(row).sort().join(',')!=='block,cents,from,to'||!Number.isSafeInteger(row.block)||row.block<v.blockFrom||row.block>v.blockTo||typeof row.from!=='string'||!row.from.length||row.from.length>128||typeof row.to!=='string'||!row.to.length||row.to.length>128||!Number.isSafeInteger(row.cents)||row.cents<0)throw new Error('Invalid committed transfer record');
  total+=BigInt(row.cents);if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsafe aggregate');
  recipients.set(row.to,(recipients.get(row.to)??0n)+BigInt(row.cents));
 }
 return {dataset:v.dataset,blockFrom:v.blockFrom,blockTo:v.blockTo,transferCount:rows.length,totalCents:Number(total),...(v.skill==='event-analysis'?{uniqueRecipients:recipients.size}:{allocations:Object.fromEntries([...recipients].map(([key,value])=>[key,Number(value)]))})};
}
export function verifyDelivery(datasetText:string,artifactText:string,taskId:Hex,expected:DeliverySpec|Hex){
 const expectedDatasetHash=typeof expected==='string'?expected:expected.datasetHash;
 if(keccak256(stringToHex(datasetText))!==expectedDatasetHash)throw new Error('Evidence bytes do not match buyer commitment');
 const decoded=JSON.parse(datasetText),v=typeof expected==='string'?undefined:expected.verification;
 let rows:unknown=decoded,source:TransferSource|undefined;
 if(v?.sourceHash){
  if(!decoded||Object.keys(decoded).sort().join(',')!=='records,source,version'||decoded.version!=='agentos.transfer-evidence.v1')throw new Error('Missing source provenance');
  source=assertSourceInput(decoded.source,{...v,records:decoded.records});if(sourceCommitment(source)!==v.sourceHash)throw new Error('Source provenance differs from commitment');rows=decoded.records;
 }
 if(!Array.isArray(rows)||rows.length>10000)throw new Error('Invalid evidence');
 const artifact=JSON.parse(artifactText),outputHash=resultHash(artifact);
 if(typeof expected!=='string'&&expected.verification){
  const v=expected.verification;validateVerification(v);const output={...recompute(rows,v),...(source?{source:sourceSummary(source,v.skill)}:{})};
  const accepted=canonical(artifact)===canonical(deliveryArtifact(taskId,v,expectedDatasetHash,output));
  return {accepted,outputHash};
 }
 // Preserve old immutable orders, but never interpret v2 or extra fields as v1.
 let total=0;for(const row of rows){if(!row||!Number.isSafeInteger(row.cents)||row.cents<0)throw new Error('Invalid amount');total+=row.cents;if(!Number.isSafeInteger(total))throw new Error('Unsafe aggregate');}
 const accepted=!!artifact&&canonical(artifact)===canonical({taskId,totalCents:total,transferCount:rows.length});
 return {accepted,outputHash};
}
