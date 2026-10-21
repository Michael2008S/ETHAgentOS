// Example provider-owned computation. AgentOS never loads this module into its server.
// The conformance runner imports it only as an explicitly selected local developer tool.
export function execute(definition,input){
 const included=input.records.filter(r=>input.blockFrom<=r.block&&r.block<=input.blockTo),totals=new Map();
 let amount=0n;for(const record of included){const key=record[definition.recipe.groupBy],value=BigInt(record.cents);amount+=value;totals.set(key,(totals.get(key)??0n)+value);}
 if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsafe aggregate.');
 const ranked=Array.from(totals,([account,value])=>({account,value})).sort((a,b)=>a.value===b.value?(a.account<b.account?-1:a.account>b.account?1:0):a.value>b.value?-1:1);
 const topAccounts=ranked.slice(0,definition.recipe.topN).map(({account,value})=>({account,amountCents:Number(value),shareBps:amount===0n?0:Number(10000n*value/amount)}));
 return {dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,transferCount:included.length,totalCents:Number(amount),groupBy:definition.recipe.groupBy,accountCount:totals.size,topAccounts,thresholdBps:definition.recipe.thresholdBps,concentrated:amount!==0n&&topAccounts[0].shareBps>=definition.recipe.thresholdBps};
}
