import {dataRpc,importTransfers} from './chain-data.ts';
import {USDC_ADDRESS,TRANSFER_TOPIC,sourceCommitment} from './transfer-source.ts';
import {DomainError} from './engine.ts';
import type {USDCMonitor} from './usdc-monitor-state.ts';
const quantity=(n:number)=>'0x'+n.toString(16);
type Block={number:string;hash:string};
export async function scanUSDCWindow(url:string,m:Pick<USDCMonitor,'cursor'|'anchor'|'draft'>,request:typeof fetch=fetch,allowCaptured=false){
 const rpc=dataRpc(url,request,allowCaptured);if(await rpc<string>('eth_chainId',[])!=='0x1')throw new DomainError('USDC monitoring requires Ethereum mainnet data.','FORBIDDEN');
 const head=await rpc<Block>('eth_getBlockByNumber',['finalized',false]),finalized=Number(BigInt(head.number));if(!Number.isSafeInteger(finalized))throw Error('Invalid finalized height.');
 if(m.anchor){const anchor=await rpc<Block>('eth_getBlockByNumber',[quantity(m.anchor.number),false]);if(anchor.hash.toLowerCase()!==m.anchor.hash)throw new DomainError('The saved finalized cursor anchor changed. Monitor stopped without rewinding or repurchasing.','CONFLICT');}
 if(m.cursor>finalized)return {kind:'waiting' as const,finalized};
 const from=m.cursor;let to=Math.min(finalized,from+m.draft.windowBlocks-1);const topic='0x'+'0'.repeat(24)+m.draft.account.slice(2).toLowerCase();
 for(;;){const logs=await rpc<unknown[]>('eth_getLogs',[{address:USDC_ADDRESS,fromBlock:quantity(from),toBlock:quantity(to),topics:[TRANSFER_TOPIC,topic]}]);if(!Array.isArray(logs))throw Error('Invalid USDC log response.');if(logs.length>25){if(from===to)throw new DomainError('One block contains more than 25 outgoing transfers. Stop and choose another bounded source; no events were truncated.','FORBIDDEN');to=from+Math.floor((to-from)/2);continue;}
  const end=await rpc<Block>('eth_getBlockByNumber',[quantity(to),false]);if(!/^0x[0-9a-fA-F]{64}$/.test(end.hash)||Number(BigInt(end.number))!==to)throw Error('Invalid USDC window checkpoint.');
  if(!logs.length)return {kind:'empty' as const,from,to,endHash:end.hash.toLowerCase(),finalized};
  const input=await importTransfers(url,{account:m.draft.account,direction:'outgoing',blockFrom:from,blockTo:to},request,{number:finalized,hash:head.hash.toLowerCase()},allowCaptured);return {kind:'data' as const,from,to,endHash:end.hash.toLowerCase(),finalized,input,sourceHash:sourceCommitment(input.source)};
 }
}
