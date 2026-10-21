import {keccak256,stringToHex} from 'viem';

/** Data-only extension contract. It cannot name code, URLs, tools or wallet operations. */
export type SkillDefinition={
 protocol:'agentos.skill-definition.v1';id:string;version:string;name:string;description:string;
 capabilities:['dataset.read','artifact.write'];input:'transfers.v1';output:'ranked-flows.v1';
 recipe:{kind:'ranked-flows.v1';groupBy:'from'|'to';topN:number;thresholdBps:number};
};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string)=>Object.keys(v).sort().join(',')===expected;
const semver=/^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;
export function assertSkillDefinition(value:unknown):asserts value is SkillDefinition{
 if(!object(value)||!keys(value,'capabilities,description,id,input,name,output,protocol,recipe,version')||value.protocol!=='agentos.skill-definition.v1'||typeof value.version!=='string'||!semver.test(value.version)||typeof value.id!=='string'||!/^ext:[a-z][a-z0-9.-]{2,62}@[0-9.]+$/.test(value.id)||!value.id.endsWith('@'+value.version)||typeof value.name!=='string'||!value.name.trim()||value.name!==value.name.trim()||value.name.length>64||typeof value.description!=='string'||!value.description.trim()||value.description.length>240||value.input!=='transfers.v1'||value.output!=='ranked-flows.v1'||!Array.isArray(value.capabilities)||value.capabilities.length!==2||value.capabilities[0]!=='dataset.read'||value.capabilities[1]!=='artifact.write'||!object(value.recipe)||!keys(value.recipe,'groupBy,kind,thresholdBps,topN')||value.recipe.kind!=='ranked-flows.v1'||!['from','to'].includes(String(value.recipe.groupBy))||!Number.isSafeInteger(value.recipe.topN)||Number(value.recipe.topN)<1||Number(value.recipe.topN)>10||!Number.isSafeInteger(value.recipe.thresholdBps)||Number(value.recipe.thresholdBps)<0||Number(value.recipe.thresholdBps)>10000)throw new Error('Invalid bounded skill definition.');
}
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(object(value))return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>JSON.stringify(key)+':'+stable(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function skillDefinitionHash(definition:SkillDefinition){assertSkillDefinition(definition);return keccak256(stringToHex(stable(definition)));}
export type RankedFlowInput={dataset:string;blockFrom:number;blockTo:number;records:{block:number;from:string;to:string;cents:number}[]};
export type RankedFlowOutput={dataset:string;blockFrom:number;blockTo:number;transferCount:number;totalCents:number;groupBy:'from'|'to';accountCount:number;topAccounts:{account:string;amountCents:number;shareBps:number}[];thresholdBps:number;concentrated:boolean};
/** Shared shape/bounds only. Execution and CRE independently calculate the result. */
export function assertRankedFlowInput(value:unknown):asserts value is RankedFlowInput{
 if(!object(value)||!keys(value,'blockFrom,blockTo,dataset,records')||typeof value.dataset!=='string'||!['eth-shenzhen-fixture-v1','custom-transfers-v1'].includes(value.dataset)||!Number.isSafeInteger(value.blockFrom)||Number(value.blockFrom)<0||!Number.isSafeInteger(value.blockTo)||Number(value.blockTo)<Number(value.blockFrom)||!Array.isArray(value.records)||value.records.length>100)throw new Error('Invalid bounded transfer input.');
 for(const row of value.records)if(!object(row)||!keys(row,'block,cents,from,to')||!Number.isSafeInteger(row.block)||Number(row.block)<0||!Number.isSafeInteger(row.cents)||Number(row.cents)<0||typeof row.from!=='string'||!row.from||row.from.length>128||typeof row.to!=='string'||!row.to||row.to.length>128)throw new Error('Invalid bounded transfer record.');
}
