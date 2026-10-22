import {DomainError} from './engine.ts';import {USDC_ADDRESS,TRANSFER_TOPIC} from './transfer-source.ts';
type RPC=<T>(method:string,params:unknown[])=>Promise<T>;
export async function usdcDemoSample(rpc:RPC){
 if(await rpc<string>('eth_chainId',[])!=='0x1')throw new DomainError('Mainnet source required.','FORBIDDEN');
 const block=await rpc<{number:string}>('eth_getBlockByNumber',['finalized',false]),head=Number(BigInt(block.number));
 for(let width=12;;width=Math.floor(width/2)){
  let logs:{topics:string[];blockNumber:string}[];
  try{logs=await rpc('eth_getLogs',[{address:USDC_ADDRESS,fromBlock:'0x'+Math.max(0,head-width).toString(16),toBlock:block.number,topics:[TRANSFER_TOPIC]}]);}
  catch(error){if(width>0&&error instanceof Error&&error.message==='Data RPC response exceeds limit.')continue;throw error;}
  const counts=new Map<string,Map<number,number>>();
  for(const log of logs){const account='0x'+log.topics[1].slice(-40),height=Number(BigInt(log.blockNumber)),windows=counts.get(account)??new Map<number,number>();windows.set(height,(windows.get(height)??0)+1);counts.set(account,windows);}
  const candidates=[...counts].map(([account,windows])=>({account,blocks:[...windows].filter(([,n])=>n<=25).sort((a,b)=>a[0]-b[0])})).filter(s=>s.blocks.length),sample=candidates.find(s=>s.blocks.length>=2)??candidates[0];
  if(!sample)throw new DomainError('No bounded finalized sample available. Retry later.','UNAVAILABLE');
  return {account:sample.account,startBlock:sample.blocks[0][0],transferCount:sample.blocks[0][1],observedBlocks:sample.blocks.map(([height])=>height)};
 }
}
