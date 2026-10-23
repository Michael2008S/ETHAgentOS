import {createPublicClient,http} from 'viem';
import {isLoopback} from './auth.ts';
import {localServices} from './local-services.ts';
import {DomainError} from './engine.ts';
import {escrowABI} from '../../sdk/chain.ts';
import {ccipLaneABI,ccipDeploymentSchema,type CCIPJob,type CCIPObservation,type CCIPTransport} from './ccip-tasks.ts';
async function bounded(response:Response){if(!response.ok)throw new DomainError('Local CCIP unavailable.','UNAVAILABLE');const reader=response.body?.getReader();if(!reader)throw Error('No CCIP response');let text='',size=0;const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;if((size+=part.value.length)>65536)throw Error('CCIP response exceeds bound');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
export function ccipOrigin(request:Request){if(!import.meta.env.DEV||!isLoopback(new URL(request.url)))throw new DomainError('CCIP prototype is local-only.','FORBIDDEN');return localServices().ccip;}
export async function configuredCCIPDeployment(request:Request){return readLocalCCIPDeployment(ccipOrigin(request));}
export async function readLocalCCIPDeployment(origin:string){const health=await bounded(await fetch(origin+'/health',{redirect:'manual',signal:AbortSignal.timeout(10000)}));if(health.newExecutionAllowed===false)throw new DomainError('Local CCIP grant or budget blocks new tasks. Existing work retains its recovery rights.','FORBIDDEN');return ccipDeploymentSchema.parse(await bounded(await fetch(origin+'/config',{redirect:'manual',signal:AbortSignal.timeout(10000)})));}
export async function configuredCCIPTransport(request:Request):Promise<CCIPTransport>{
 return localCCIPTransport(ccipOrigin(request));
}
export function localCCIPTransport(origin:string):CCIPTransport {
 return {origin,async step(job:CCIPJob){
  const raw=await bounded(await fetch(origin+'/step',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify(job),signal:AbortSignal.timeout(30000)}));
  // Read contracts independently; do not infer settlement from the /step response.
  const a=createPublicClient({transport:http(origin+'/chain/a',{timeout:10000,retryCount:0}),cacheTime:0}),b=createPublicClient({transport:http(origin+'/chain/b',{timeout:10000,retryCount:0}),cacheTime:0});
  const [aid,bid,ablock,bblock]=await Promise.all([a.getChainId(),b.getChainId(),a.getBlock(),b.getBlock()]);
  const [at,bt,escrow,ar,br]=await Promise.all([a.readContract({address:job.deployment.a.lane,abi:ccipLaneABI,functionName:'tasks',args:[job.chainTaskId],blockNumber:ablock.number!}),b.readContract({address:job.deployment.b.lane,abi:ccipLaneABI,functionName:'tasks',args:[job.chainTaskId],blockNumber:bblock.number!}),b.readContract({address:job.deployment.b.escrow,abi:escrowABI,functionName:'tasks',args:[job.chainTaskId],blockNumber:bblock.number!}),a.readContract({address:job.deployment.a.lane,abi:ccipLaneABI,functionName:'reserved',blockNumber:ablock.number!}),b.readContract({address:job.deployment.b.lane,abi:ccipLaneABI,functionName:'reserved',blockNumber:bblock.number!})]);
  if(aid!==31338||bid!==31339)throw Error('CCIP chain mismatch');
  const amount=BigInt(job.draft.budgetCents)*10000n,expires=BigInt(Math.floor(Date.parse(job.expiresAt)/1000));
  for(const t of [at,bt])if(t[3]!==0&&(t[0]!==amount||t[1]!==expires||t[2]!==job.termsHash))throw Error('CCIP on-chain terms mismatch');
  if(escrow[5]!==0&&(escrow[0].toLowerCase()!==job.deployment.b.vault||escrow[1].toLowerCase()!==job.deployment.b.seller||escrow[2]!==amount||escrow[4]!==job.termsHash))throw Error('CCIP escrow mismatch');
  if(at[3]===5&&bt[3]===5&&([2,3].includes(escrow[5])&&(at[5]!== (escrow[5]===2)||at[6]!==escrow[6])||at[5]!==bt[5]||at[6]!==bt[6]))throw Error('CCIP result and escrow differ');
  const evidence:CCIPObservation={aPhase:at[3],bPhase:bt[3],escrowStatus:escrow[5],accepted:at[5],outputHash:at[6],aReserved:String(ar),bReserved:String(br),blocks:{a:{number:String(ablock.number),hash:ablock.hash!},b:{number:String(bblock.number),hash:bblock.hash!}}};
  if(typeof raw.artifactText==='string')evidence.artifactText=raw.artifactText;return evidence;
 }};
}
