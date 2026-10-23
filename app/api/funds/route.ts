import {env} from 'cloudflare:workers';
import {createPublicClient,http} from 'viem';
import {owner,read} from '@/lib/agentos/store';
import {fundsEvidence} from '@/lib/agentos/funds-evidence';
import {readX402Evidence,type X402Evidence} from '@/lib/agentos/x402-evidence';
import {serverChain} from '@/lib/agentos/chain-config';
import {ccipOrigin} from '@/lib/agentos/ccip-runtime';
import {ccipDeploymentSchema,ccipLaneABI} from '@/lib/agentos/ccip-tasks';
import {tokenABI} from '@/sdk/chain';
import {apiFailure} from '@/lib/agentos/api-failure';
export async function GET(request:Request){try{
 const ownerId=owner(request),snapshot=await read(ownerId),evidence:Record<string,X402Evidence|undefined>={},unavailable:string[]=[];
 for(const order of snapshot.state.chainOrders??[])if(order.x402Review)try{evidence[order.id]=env.DB?await readX402Evidence(env.DB,ownerId,order.id):undefined;}catch{unavailable.push('x402:'+order.id);}
 const balances:{pool:string;chainId:number;asset:string;vault:string;balance:string;decimals:number;reserved?:string;blockNumber:string;blockHash:string}[]=[];
 const inspect=async(pool:string,chainId:number,asset:`0x${string}`,vault:`0x${string}`,rpc:string,lane?:`0x${string}`)=>{
  const client=createPublicClient({transport:http(rpc,{timeout:3000,retryCount:0}),cacheTime:0});if(await client.getChainId()!==chainId)throw Error('Chain differs');const block=await client.getBlock();if(!block.hash||block.number===null)throw Error('Missing block');
  const [balance,decimals,reserved]=await Promise.all([client.readContract({address:asset,abi:tokenABI,functionName:'balanceOf',args:[vault],blockNumber:block.number}),client.readContract({address:asset,abi:tokenABI,functionName:'decimals',blockNumber:block.number}),lane?client.readContract({address:lane,abi:ccipLaneABI,functionName:'reserved',blockNumber:block.number}):Promise.resolve(undefined)]);
  balances.push({pool,chainId,asset,vault,balance:String(balance),decimals,...(reserved===undefined?{}:{reserved:String(reserved)}),blockNumber:String(block.number),blockHash:block.hash});
 };
 await Promise.all([
  (async()=>{try{const {deployment:d,rpcUrl}=await serverChain(request,env.AGENTOS_CHAIN_CONFIGURATION);if(d.vault)await inspect('main',d.chainId,d.token,d.vault,rpcUrl);else unavailable.push('main-vault');}catch{unavailable.push('main-vault');}})(),
  (async()=>{try{const origin=ccipOrigin(request),response=await fetch(origin+'/config',{redirect:'manual',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('Unavailable');const d=ccipDeploymentSchema.parse(await response.json());await Promise.all((['a','b'] as const).map(async key=>{const c=d[key];try{await inspect('ccip-'+key,c.chainId,c.token,c.vault,origin+'/chain/'+key,c.lane);}catch{unavailable.push('ccip-'+key);}}));}catch{unavailable.push('ccip-a','ccip-b');}})(),
 ]);
 return Response.json({scope:snapshot.scope,revision:snapshot.revision,observedAt:new Date().toISOString(),...fundsEvidence(snapshot.state,evidence),balances,unavailable},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return apiFailure(error,'runtime');}}
