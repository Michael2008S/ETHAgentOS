import {z} from 'zod';
import {keccak256,stringToHex} from 'viem';

// Circle's Ethereum mainnet USDC deployment. This module never sends transactions.
export const USDC_ADDRESS='0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
export const TRANSFER_TOPIC=keccak256(stringToHex('Transfer(address,address,uint256)'));
const integer=z.number().int().nonnegative().safe();
const hash=z.string().regex(/^0x[0-9a-f]{64}$/);
const address=z.string().regex(/^0x[0-9a-f]{40}$/);
export type TransferSource={version:'agentos.ethereum-usdc.v1';chainId:1;token:typeof USDC_ADDRESS;decimals:6;account:string;direction:'incoming'|'outgoing'|'all';blockFrom:number;blockTo:number;finalized:{number:number;hash:string};blocks:{number:number;hash:string}[];logs:{address:typeof USDC_ADDRESS;blockNumber:number;blockHash:string;transactionHash:string;logIndex:number;topics:[typeof TRANSFER_TOPIC,string,string];data:string}[]};
export const transferSourceSchema:z.ZodType<TransferSource>=z.object({
 version:z.literal('agentos.ethereum-usdc.v1'),chainId:z.literal(1),token:z.literal(USDC_ADDRESS),decimals:z.literal(6),
 account:address,direction:z.enum(['incoming','outgoing','all']),blockFrom:integer,blockTo:integer,
 finalized:z.object({number:integer,hash}).strict(),
 blocks:z.array(z.object({number:integer,hash}).strict()).min(1).max(25),
 logs:z.array(z.object({address:z.literal(USDC_ADDRESS),blockNumber:integer,blockHash:hash,transactionHash:hash,logIndex:integer,topics:z.tuple([z.literal(TRANSFER_TOPIC),hash,hash]),data:hash}).strict()).min(1).max(25),
}).strict();
export type SourceSummary={chainId:1;token:typeof USDC_ADDRESS;decimals:6;sourceHash:string;totalBaseUnits:string;roundingRemainderBaseUnits:string;allocationsBaseUnits?:Record<string,string>};
export const sourceSummarySchema:z.ZodType<SourceSummary>=z.object({chainId:z.literal(1),token:z.literal(USDC_ADDRESS),decimals:z.literal(6),sourceHash:hash,totalBaseUnits:z.string().regex(/^\d+$/),roundingRemainderBaseUnits:z.string().regex(/^\d+$/),allocationsBaseUnits:z.record(z.string().regex(/^\d+$/)).optional()}).strict();

export function parseTransferSource(raw:unknown):TransferSource{
 const s=transferSourceSchema.parse(raw);
 if(s.blockTo<s.blockFrom||s.blockTo-s.blockFrom>=10000||s.finalized.number<s.blockTo)throw new Error('Invalid finalized source range.');
 const blocks=new Map(s.blocks.map(b=>[b.number,b.hash]));
 if(blocks.size!==s.blocks.length||s.blocks.some((b,i)=>b.number<s.blockFrom||b.number>s.blockTo||i>0&&b.number<=s.blocks[i-1].number))throw new Error('Invalid source block headers.');
 const seen=new Set<string>();let previous=-1,previousIndex=-1,total=0n;
 for(const log of s.logs){
  const key=log.transactionHash+':'+log.logIndex;
  if(seen.has(key)||blocks.get(log.blockNumber)!==log.blockHash||log.blockNumber<previous||log.blockNumber===previous&&log.logIndex<=previousIndex||log.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/.test(t)))throw new Error('Invalid, duplicate or reordered source log.');
  const from='0x'+log.topics[1].slice(-40),to='0x'+log.topics[2].slice(-40);
  if(s.direction==='incoming'?to!==s.account:s.direction==='outgoing'?from!==s.account:from!==s.account&&to!==s.account)throw new Error('Source log differs from the selected account.');
  total+=BigInt(log.data)/10000n;if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Source amount exceeds the supported cent range.');
  seen.add(key);previous=log.blockNumber;previousIndex=log.logIndex;
 }
 if(s.blocks.some(b=>!s.logs.some(l=>l.blockNumber===b.number)))throw new Error('Unused source block header.');
 return s;
}
export function sourceRecords(source:TransferSource){
 return source.logs.map(log=>({block:log.blockNumber,from:'0x'+log.topics[1].slice(-40),to:'0x'+log.topics[2].slice(-40),cents:Number(BigInt(log.data)/10000n)}));
}
export function sourceCommitment(raw:unknown){return keccak256(stringToHex(JSON.stringify(parseTransferSource(raw))));}
export function assertSourceInput(raw:unknown,input:{dataset:string;blockFrom:number;blockTo:number;records?:unknown[]}){
 const source=parseTransferSource(raw);
 if(input.dataset!=='custom-transfers-v1'||source.blockFrom!==input.blockFrom||source.blockTo!==input.blockTo||JSON.stringify(sourceRecords(source))!==JSON.stringify(input.records))throw new Error('Transfer input differs from its raw source events.');
 return source;
}
export function sourceSummary(source:TransferSource,skill:string){
 let total=0n,remainder=0n;const allocations=new Map<string,bigint>();
 for(const log of source.logs){const value=BigInt(log.data),to='0x'+log.topics[2].slice(-40);total+=value;remainder+=value%10000n;allocations.set(to,(allocations.get(to)??0n)+value);}
 return {chainId:1,token:USDC_ADDRESS,decimals:6,sourceHash:sourceCommitment(source),totalBaseUnits:total.toString(),roundingRemainderBaseUnits:remainder.toString(),...(skill==='treasury-report'?{allocationsBaseUnits:Object.fromEntries([...allocations].map(([key,value])=>[key,value.toString()]))}:{})};
}
