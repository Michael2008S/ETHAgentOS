import {USDC_ADDRESS,TRANSFER_TOPIC,parseTransferSource,sourceRecords,type TransferSource} from './transfer-source.ts';

export type DataQuery={account:string;direction:'incoming'|'outgoing'|'all';blockFrom?:number;blockTo?:number};
type Block={number:string;hash:string};
type RpcLog={address:string;blockNumber:string;blockHash:string;transactionHash:string;logIndex:string;topics:string[];data:string;removed?:boolean};
const quantity=(n:number)=>'0x'+n.toString(16);
const number=(raw:unknown)=>{if(typeof raw!=='string'||!/^0x[0-9a-f]+$/i.test(raw)||!Number.isSafeInteger(Number(BigInt(raw))))throw new Error('Invalid RPC quantity.');return Number(BigInt(raw));};
export type DataRPCURL=string|readonly string[];
export class DataRPCError extends Error {category:'transport'|'http'|'invalid'|'limit';method:string;status?:number;constructor(category:'transport'|'http'|'invalid'|'limit',method:string,status?:number){super(category==='limit'?'Data RPC response exceeds limit.':`Data RPC ${category==='http'?'HTTP failure':category==='invalid'?'invalid response':'transport failed'}: ${status?status+' ':''}${method}`);this.category=category;this.method=method;this.status=status;}}
export function dataRpc(url:DataRPCURL,request:typeof fetch=fetch,allowCaptured=false){
 const endpoints=[...new Set(typeof url==='string'?[url]:url)].map(value=>{const endpoint=new URL(value);if(!(endpoint.protocol==='https:'||allowCaptured&&endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'&&['/captured-usdc','/live-usdc'].includes(endpoint.pathname))||endpoint.username||endpoint.password||endpoint.hash||endpoint.search)throw new Error('Configure a plain HTTPS data RPC endpoint.');return endpoint;});
 if(!endpoints.length||endpoints.length>3)throw Error('Configure one to three data RPC endpoints.');let preferred=0,pinned:{number:number;hash:string}|undefined;const verified=new Set<number>(),rejected=new Set<number>(),pins=new Map<number,string>();
 async function perform<T>(index:number,method:string,params:unknown[]):Promise<T>{
  const response=await request(endpoints[index].href,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(8000)}).catch(()=>{throw new DataRPCError('transport',method);});
  if(!response.ok){await response.body?.cancel();throw new DataRPCError('http',method,response.status);}const reader=response.body?.getReader();if(!reader)throw new DataRPCError('invalid',method);let size=0,text='';const decoder=new TextDecoder();try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>1000000){await reader.cancel();throw new DataRPCError('limit',method);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  let result;try{result=JSON.parse(text);}catch{throw new DataRPCError('invalid',method);}if(result.error&&/response.*exceeds|too many results|query.*(?:more than|large|limit)|result.*(?:too large|exceed)|block range|response size/i.test(result.error.message??''))throw new DataRPCError('limit',method);if(result.jsonrpc!=='2.0'||result.id!==1||result.error||result.result===undefined||result.result===null)throw new DataRPCError('invalid',method);return result.result;
 }
 async function call<T>(method:string,params:unknown[]):Promise<T>{
  if(!['eth_chainId','eth_getBlockByNumber','eth_call','eth_getLogs'].includes(method))throw Error('Read-only data RPC method required.');const start=preferred;let last:unknown;
  for(let attempt=0;attempt<Math.min(3,endpoints.length+1);attempt++){const index=(start+attempt)%endpoints.length;if(rejected.has(index))continue;
   try{let chainId:string|undefined;if(!verified.has(index)||method==='eth_chainId'){chainId=await perform<string>(index,'eth_chainId',[]);if(chainId!=='0x1'){rejected.add(index);throw new DataRPCError('invalid','eth_chainId');}verified.add(index);}if(pinned&&pins.get(index)!==pinned.hash){const block=await perform<Block>(index,'eth_getBlockByNumber',[quantity(pinned.number),false]);if(number(block.number)!==pinned.number||block.hash?.toLowerCase()!==pinned.hash)throw new DataRPCError('invalid','eth_getBlockByNumber');pins.set(index,pinned.hash);}
    const result=method==='eth_chainId'?chainId:await perform<T>(index,method,params);preferred=index;return result as T;
   }catch(error){last=error;if(error instanceof DataRPCError&&(error.category==='limit'||error.category==='http'&&![429,502,503,504].includes(error.status!)&&(endpoints.length===1||attempt>=endpoints.length-1)))throw error;}
  }throw last??new DataRPCError('invalid',method);
 }
 return Object.assign(call,{pin(number:number,hash:string){if(!Number.isSafeInteger(number)||number<0||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Invalid source checkpoint.');pinned={number,hash:hash.toLowerCase()};}});
}
/** Bounded, read-only source import. No private key or token approval is involved. */
export async function importTransfers(url:DataRPCURL,query:DataQuery,request:typeof fetch=fetch,checkpoint?:TransferSource['finalized'],allowCaptured=false){
 if(!/^0x[0-9a-fA-F]{40}$/.test(query.account)||!['incoming','outgoing','all'].includes(query.direction))throw new Error('An Ethereum account and valid direction are required.');
 const rpc=dataRpc(url,request,allowCaptured);
 if(await rpc<string>('eth_chainId',[])!=='0x1')throw new Error('The data source must be Ethereum mainnet.');
 const final=await rpc<Block>('eth_getBlockByNumber',['finalized',false]),head=number(final.number),blockTo=query.blockTo??head,blockFrom=query.blockFrom??blockTo;
 if(!Number.isSafeInteger(blockFrom)||blockFrom<0||!Number.isSafeInteger(blockTo)||blockTo<blockFrom||blockTo-blockFrom>=10000||blockTo>head)throw new Error('Select at most 10000 finalized blocks.');
 const fixed=checkpoint?await rpc<Block>('eth_getBlockByNumber',[quantity(checkpoint.number),false]):final;
 if(checkpoint&&(checkpoint.number>head||fixed.hash.toLowerCase()!==checkpoint.hash))throw new Error('The recorded finality checkpoint is no longer canonical.');
 rpc.pin(number(fixed.number),fixed.hash);
 const decimals=await rpc<string>('eth_call',[{to:USDC_ADDRESS,data:'0x313ce567'},quantity(blockTo)]);
 if(BigInt(decimals)!==6n)throw new Error('Unexpected source token precision.');
 const account=query.account.toLowerCase(),topic='0x'+'0'.repeat(24)+account.slice(2),base={address:USDC_ADDRESS,fromBlock:quantity(blockFrom),toBlock:quantity(blockTo)};
 const filters=query.direction==='all'?[[TRANSFER_TOPIC,topic],[TRANSFER_TOPIC,null,topic]]:[query.direction==='incoming'?[TRANSFER_TOPIC,null,topic]:[TRANSFER_TOPIC,topic]];
 const responses=await Promise.all(filters.map(topics=>rpc<RpcLog[]>('eth_getLogs',[{...base,topics}])));
 if(responses.some(rows=>!Array.isArray(rows)))throw new Error('Invalid source logs.');
 const unique=new Map<string,RpcLog>();
 for(const rows of responses)for(const log of rows){if(log.removed)throw new Error('Removed source log.');const key=log.transactionHash+':'+log.logIndex,old=unique.get(key);if(old&&JSON.stringify(old)!==JSON.stringify(log))throw new Error('Conflicting source logs.');unique.set(key,log);}
 if(!unique.size)throw new Error('No USDC transfers in this finalized range.');
 if(unique.size>25)throw new Error('More than 25 transfers; narrow the range. No records were truncated.');
 const logs=[...unique.values()].map(log=>({address:log.address.toLowerCase(),blockNumber:number(log.blockNumber),blockHash:log.blockHash.toLowerCase(),transactionHash:log.transactionHash.toLowerCase(),logIndex:number(log.logIndex),topics:log.topics.map(t=>t.toLowerCase()),data:log.data.toLowerCase()})).sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex);
 const numbers=[...new Set(logs.map(log=>log.blockNumber))];
 const blocks=[];for(let i=0;i<numbers.length;i+=5){const batch=await Promise.all(numbers.slice(i,i+5).map(n=>rpc<Block>('eth_getBlockByNumber',[quantity(n),false])));blocks.push(...batch.map(block=>({number:number(block.number),hash:block.hash.toLowerCase()})));}
 const source=parseTransferSource({version:'agentos.ethereum-usdc.v1',chainId:1,token:USDC_ADDRESS,decimals:6,account,direction:query.direction,blockFrom,blockTo,finalized:{number:number(fixed.number),hash:fixed.hash.toLowerCase()},blocks,logs});
 return {dataset:'custom-transfers-v1',blockFrom,blockTo,records:sourceRecords(source),source};
}
export async function verifyTransferSource(url:DataRPCURL,source:TransferSource,request:typeof fetch=fetch,allowCaptured=false){
 const parsed=parseTransferSource(source),current=await importTransfers(url,parsed,request,parsed.finalized,allowCaptured);
 if(JSON.stringify(current.source)!==JSON.stringify(parsed))throw new Error('Source events or canonical blocks have changed.');
 return current;
}

export function deadlineDataFetch(request:typeof fetch=fetch,milliseconds=35000):typeof fetch{const end=Date.now()+milliseconds;return (url,init)=>request(url,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(Math.max(0,end-Date.now()))])});}
