import {assertRankedFlowInput,assertSkillDefinition,type RankedFlowInput,type SkillDefinition} from '../../lib/agentos/skill-definition.ts';

/** Independent BigInt reduction. Does not import the website or supplier executor. */
export function recomputeRankedFlows(definition:SkillDefinition,input:RankedFlowInput){
 assertSkillDefinition(definition);assertRankedFlowInput(input);
 const accounts=new Map<string,bigint>();let total=0n,count=0;
 for(const record of input.records){
  if(record.block<input.blockFrom||record.block>input.blockTo)continue;
  const amount=BigInt(record.cents),account=definition.recipe.groupBy==='from'?record.from:record.to;count++;total+=amount;
  if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsafe aggregate.');accounts.set(account,(accounts.get(account)??0n)+amount);
 }
 const ordered=[...accounts.keys()].sort((a,b)=>{const x=accounts.get(a)!,y=accounts.get(b)!;return x===y?(a<b?-1:a>b?1:0):x>y?-1:1;});
 const leaders=ordered.slice(0,definition.recipe.topN).map(account=>{const amount=accounts.get(account)!;return {account,amountCents:Number(amount),shareBps:total===0n?0:Number(amount*10000n/total)};});
 return {dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,transferCount:count,totalCents:Number(total),groupBy:definition.recipe.groupBy,accountCount:accounts.size,topAccounts:leaders,thresholdBps:definition.recipe.thresholdBps,concentrated:total>0n&&leaders[0]!.shareBps>=definition.recipe.thresholdBps};
}
