import {assertRankedFlowInput,assertSkillDefinition,type RankedFlowInput,type RankedFlowOutput,type SkillDefinition} from './skill-definition.ts';

/** Runtime interpreter for reviewed data-only recipes; it never imports provider code. */
export function executeRankedFlows(definition:SkillDefinition,input:RankedFlowInput):RankedFlowOutput{
 assertSkillDefinition(definition);assertRankedFlowInput(input);
 const rows=input.records.filter(r=>r.block>=input.blockFrom&&r.block<=input.blockTo),groups=new Map<string,number>();let totalCents=0;
 for(const row of rows){totalCents+=row.cents;if(!Number.isSafeInteger(totalCents))throw new Error('Unsafe aggregate.');const key=row[definition.recipe.groupBy];groups.set(key,(groups.get(key)??0)+row.cents);}
 const topAccounts=[...groups].sort(([a,x],[b,y])=>y-x||(a<b?-1:a>b?1:0)).slice(0,definition.recipe.topN).map(([account,amountCents])=>({account,amountCents,shareBps:totalCents===0?0:Number(BigInt(amountCents)*10000n/BigInt(totalCents))}));
 return {dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,transferCount:rows.length,totalCents,groupBy:definition.recipe.groupBy,accountCount:groups.size,topAccounts,thresholdBps:definition.recipe.thresholdBps,concentrated:totalCents>0&&topAccounts[0]!.shareBps>=definition.recipe.thresholdBps};
}
