import {keccak256,stringToHex,type Hex} from 'viem';
import {assertSourceInput,sourceCommitment,sourceSummary,type TransferSource} from '../../lib/agentos/transfer-source.ts';
import {assertSkillDefinition,type SkillDefinition,type RankedFlowInput} from '../../lib/agentos/skill-definition.ts';
import {recomputeRankedFlows} from './ranked-flows.ts';
export type DeliveryVerification={version:'agentos.delivery.v2';skill:string;skillVersion:string;dataset:string;blockFrom:number;blockTo:number;sourceHash?:Hex;memoryHash?:Hex;skillDefinition?:SkillDefinition};
// Optional only for historical v1 commitments. New purchases require v2.
export type DeliverySpec={datasetUrl:string;datasetHash:Hex;artifactUrl:string;verification?:DeliveryVerification};
export type AcceptedArtifact={version:'agentos.accepted-artifact.v1'|'agentos.accepted-artifact.v2';projection?:'allocations.v1'|'ranked-accounts.v1'|'summary-total.v1';orderId:string;chainId:number;escrow:Hex;taskId:Hex;settlementTransactionHash:Hex;artifactHash:Hex;datasetText:string;artifactText:string;spec:DeliverySpec};
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export const specHash=(spec:DeliverySpec)=>keccak256(stringToHex(canonical(spec)));
export const resultHash=(output:unknown)=>keccak256(stringToHex(canonical(output)));
export function deliveryVerification(skill:DeliveryVerification['skill'],input:{dataset:string;blockFrom:number;blockTo:number;source?:TransferSource;memory?:AcceptedArtifact;skillDefinition?:SkillDefinition}):DeliveryVerification{
 const verification:DeliveryVerification={version:'agentos.delivery.v2',skill,skillVersion:input.skillDefinition?.version??'1.0.0',dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,...(input.source?{sourceHash:sourceCommitment(input.source)}:{}),...(input.memory?{memoryHash:resultHash(input.memory)}:{}),...(input.skillDefinition?{skillDefinition:structuredClone(input.skillDefinition)}:{})};
 validateVerification(verification);return verification;
}
export function validateVerification(value:unknown):asserts value is DeliveryVerification{
 const v=value as DeliveryVerification;
 const keys=['blockFrom','blockTo','dataset','skill','skillVersion','version',...(v?.sourceHash===undefined?[]:['sourceHash']),...(v?.memoryHash===undefined?[]:['memoryHash']),...(v?.skillDefinition===undefined?[]:['skillDefinition'])].sort().join(',');
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys||[v.sourceHash,v.memoryHash].some(h=>h!==undefined&&!/^0x[0-9a-f]{64}$/.test(h))||v.sourceHash&&v.memoryHash||v.version!=='agentos.delivery.v2'||!['eth-shenzhen-fixture-v1','custom-transfers-v1'].includes(v.dataset)||!Number.isSafeInteger(v.blockFrom)||v.blockFrom<0||!Number.isSafeInteger(v.blockTo)||v.blockTo<v.blockFrom)throw new Error('Invalid versioned delivery verification');
 if(v.skillDefinition!==undefined){assertSkillDefinition(v.skillDefinition);if(v.skillDefinition.id!==v.skill||v.skillDefinition.version!==v.skillVersion)throw new Error('Skill definition differs from the committed skill and version');}
 else if(!['event-analysis','treasury-report'].includes(v.skill)||v.skillVersion!=='1.0.0')throw new Error('Unrecognized skill requires a bounded definition');
}
/** Complete arithmetic is independently verified at every bounded ancestor.
 * Payment authenticity is separately checked by the runtime for the entire lineage.
 */
export const MAX_MEMORY_DEPTH=8;
export function acceptedMemoryRecords(value:unknown){return memoryRecords(value,0);}
function memoryRecords(value:unknown,depth:number):{block:number;from:string;to:string;cents:number}[]{
 const m=value as AcceptedArtifact,legacy=m?.version==='agentos.accepted-artifact.v1';
 const keys='artifactHash,artifactText,chainId,datasetText,escrow,orderId,'+(legacy?'':'projection,')+'settlementTransactionHash,spec,taskId,version';
 if(depth>=MAX_MEMORY_DEPTH||!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).sort().join(',')!==keys||!['agentos.accepted-artifact.v1','agentos.accepted-artifact.v2'].includes(m.version)||typeof m.orderId!=='string'||!/^chain-[a-zA-Z0-9-]{1,100}$/.test(m.orderId)||!Number.isSafeInteger(m.chainId)||m.chainId<=0||!/^0x[0-9a-fA-F]{40}$/.test(m.escrow)||[m.taskId,m.settlementTransactionHash,m.artifactHash].some(h=>!/^0x[0-9a-f]{64}$/.test(h))||typeof m.datasetText!=='string'||m.datasetText.length>32768||typeof m.artifactText!=='string'||m.artifactText.length>32768||!m.spec||Object.keys(m.spec).sort().join(',')!=='artifactUrl,datasetHash,datasetUrl,verification'||legacy&&(m.spec.verification?.memoryHash||m.spec.verification?.skill!=='treasury-report'))throw new Error('Invalid accepted artifact memory or lineage depth');
 validateVerification(m.spec.verification);
 const verdict=verifyAtDepth(m.datasetText,m.artifactText,m.taskId,m.spec,depth+1);
 if(!verdict.accepted||verdict.outputHash!==m.artifactHash)throw new Error('Parent artifact does not pass complete acceptance');
 const output=JSON.parse(m.artifactText).output,skill=m.spec.verification.skill;
 let entries:[string,number][];
 if((legacy||m.projection==='allocations.v1')&&skill==='treasury-report')entries=Object.entries(output.allocations);
 else if(m.projection==='ranked-accounts.v1'&&m.spec.verification.skillDefinition)entries=output.topAccounts.map((row:{account:string;amountCents:number})=>[row.account,row.amountCents]);
 else if(m.projection==='summary-total.v1'&&skill==='event-analysis')entries=[['accepted-summary-total',output.totalCents]];
 else throw new Error('Unsupported accepted artifact projection');
 const records=entries.sort(([a],[b])=>a<b?-1:a>b?1:0).map(([to,cents])=>({block:0,from:m.orderId,to,cents}));
 if(!records.length||records.length>100)throw new Error('Parent has no supported allocation records');
 return records;
}
export function deliveryArtifact(taskId:Hex,verification:DeliveryVerification,datasetHash:Hex,output:unknown){
 return {version:'agentos.delivery.v2',taskId,verification,datasetHash,output,outputHash:resultHash(output)};
}
/** Independently computes the full skill result; does not import runtime adapters. */
function recompute(rows:unknown[],v:DeliveryVerification){
 if(v.skillDefinition)return recomputeRankedFlows(v.skillDefinition,{dataset:v.dataset,blockFrom:v.blockFrom,blockTo:v.blockTo,records:rows} as RankedFlowInput);
 let total=0n;const recipients=new Map<string,bigint>();
 for(const raw of rows){
  const row=raw as {block:number;from:string;to:string;cents:number};
  if(!row||Object.keys(row).sort().join(',')!=='block,cents,from,to'||!Number.isSafeInteger(row.block)||row.block<v.blockFrom||row.block>v.blockTo||typeof row.from!=='string'||!row.from.length||row.from.length>128||typeof row.to!=='string'||!row.to.length||row.to.length>128||!Number.isSafeInteger(row.cents)||row.cents<0)throw new Error('Invalid committed transfer record');
  total+=BigInt(row.cents);if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsafe aggregate');
  recipients.set(row.to,(recipients.get(row.to)??0n)+BigInt(row.cents));
 }
 return {dataset:v.dataset,blockFrom:v.blockFrom,blockTo:v.blockTo,transferCount:rows.length,totalCents:Number(total),...(v.skill==='event-analysis'?{uniqueRecipients:recipients.size}:{allocations:Object.fromEntries([...recipients].map(([key,value])=>[key,Number(value)]))})};
}
export function verifyDelivery(datasetText:string,artifactText:string,taskId:Hex,expected:DeliverySpec|Hex){return verifyAtDepth(datasetText,artifactText,taskId,expected,0);}
function verifyAtDepth(datasetText:string,artifactText:string,taskId:Hex,expected:DeliverySpec|Hex,depth:number){
 const expectedDatasetHash=typeof expected==='string'?expected:expected.datasetHash;
 if(keccak256(stringToHex(datasetText))!==expectedDatasetHash)throw new Error('Evidence bytes do not match buyer commitment');
 const decoded=JSON.parse(datasetText),v=typeof expected==='string'?undefined:expected.verification;
 let rows:unknown=decoded,source:TransferSource|undefined;
 if(v?.sourceHash){
  if(!decoded||Object.keys(decoded).sort().join(',')!=='records,source,version'||decoded.version!=='agentos.transfer-evidence.v1')throw new Error('Missing source provenance');
  source=assertSourceInput(decoded.source,{...v,records:decoded.records});if(sourceCommitment(source)!==v.sourceHash)throw new Error('Source provenance differs from commitment');rows=decoded.records;
 }
 if(v?.memoryHash){
  if(!decoded||Object.keys(decoded).sort().join(',')!=='memory,records,version'||decoded.version!=='agentos.memory-evidence.v1'||v.dataset!=='custom-transfers-v1'||v.blockFrom!==0||v.blockTo!==0||resultHash(decoded.memory)!==v.memoryHash||canonical(memoryRecords(decoded.memory,depth))!==canonical(decoded.records))throw new Error('Accepted memory differs from its commitment or derived records');
  rows=decoded.records;
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
