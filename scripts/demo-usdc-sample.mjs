import {DataRPCError} from '../lib/agentos/chain-data.ts';
import {USDC_ADDRESS,TRANSFER_TOPIC} from '../lib/agentos/transfer-source.ts';

/** Read the entire recent sample while retaining the RPC response-size ceiling. */
export async function recentUSDCLogs(rpc,fromBlock,toBlock){
 if(!Number.isSafeInteger(fromBlock)||!Number.isSafeInteger(toBlock)||fromBlock<0||toBlock<fromBlock||toBlock-fromBlock>12)throw Error('Select at most 13 recent finalized blocks.');
 async function read(from,to){
  try{
   const logs=await rpc('eth_getLogs',[{address:USDC_ADDRESS,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16),topics:[TRANSFER_TOPIC]}]);
   if(!Array.isArray(logs))throw Error('Invalid USDC log response.');
   return logs;
  }catch(error){
   if(!(error instanceof DataRPCError)||error.category!=='limit'||error.method!=='eth_getLogs'||from===to)throw error;
   const middle=from+Math.floor((to-from)/2);
   const left=await read(from,middle),right=await read(middle+1,to);
   return [...left,...right];
  }
 }
 return read(fromBlock,toBlock);
}
