import type {Address,Hex,PublicClient} from 'viem';
import {escrowABI} from './chain.ts';
export type SettlementCursor={nextBlock:string;anchorBlock:string;anchorHash:Hex};
/** Bounded, confirmed log discovery. A changed anchor restarts from the funding block.
 * Discovery is never payment proof: callers must verify the complete mined receipt.
 */
export async function scanSettledTask(client:PublicClient,input:{escrow:Address;taskId:Hex;fundingBlock:string;confirmations:number;cursor?:SettlementCursor},limits:{blockSpan?:number;windows?:number}={}){
 const span=limits.blockSpan??2000,windows=limits.windows??4;
 if(!Number.isSafeInteger(span)||span<1||span>2000||!Number.isSafeInteger(windows)||windows<1||windows>4||!Number.isSafeInteger(input.confirmations)||input.confirmations<1||!/^\d{1,20}$/.test(input.fundingBlock))throw new Error('Invalid settlement scan bounds.');
 const tip=await client.getBlockNumber({cacheTime:0}),confirmed=tip-BigInt(input.confirmations-1),start=BigInt(input.fundingBlock);
 let from=start,cursor=input.cursor;
 if(cursor){
  if(![cursor.nextBlock,cursor.anchorBlock].every(s=>/^\d{1,20}$/.test(s))||BigInt(cursor.nextBlock)!==BigInt(cursor.anchorBlock)+1n||BigInt(cursor.anchorBlock)<start||!/^0x[0-9a-f]{64}$/.test(cursor.anchorHash))throw new Error('Invalid persisted settlement cursor.');
  if(BigInt(cursor.anchorBlock)<=confirmed&&(await client.getBlock({blockNumber:BigInt(cursor.anchorBlock)})).hash===cursor.anchorHash)from=BigInt(cursor.nextBlock);
  else cursor=undefined;
 }
 for(let i=0;i<windows&&from<=confirmed;i++){
  const to=from+BigInt(span)-1n<confirmed?from+BigInt(span)-1n:confirmed;
  const before=await client.getBlock({blockNumber:to}),logs=await client.getContractEvents({address:input.escrow,abi:escrowABI,eventName:'Settled',args:{id:input.taskId},fromBlock:from,toBlock:to}),after=await client.getBlock({blockNumber:to});
  if(!before.hash||!after.hash||before.hash!==after.hash)throw new Error('Settlement scan changed canonical blocks. Retry the same checkpoint.');
  if(logs.length>1||logs.some(log=>log.removed||!log.transactionHash))throw new Error('Conflicting settlement events.');
  if(logs.length)return {transactionHash:logs[0].transactionHash!,cursor};
  cursor={nextBlock:(to+1n).toString(),anchorBlock:to.toString(),anchorHash:after.hash!};from=to+1n;
 }
 return {transactionHash:null,cursor};
}
