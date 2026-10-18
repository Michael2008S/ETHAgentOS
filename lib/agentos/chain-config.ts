import { createPublicClient, http } from 'viem';
import { walletDeployment } from '../../sdk/wallet.ts';
import { DomainError } from './engine.ts';

/** RPC and contracts come from server configuration, never from the caller. */
export async function serverChain(request:Request,configuration?:string) {
  let publicDeployment:unknown,rpcUrl:string;
  if(configuration){
    const parsed=JSON.parse(configuration);publicDeployment=parsed.deployment;rpcUrl=parsed.rpcUrl;
    const url=new URL(rpcUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Server chain RPC must be an HTTPS endpoint without embedded credentials.');
  }else if(import.meta.env?.DEV&&['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)){
    const base='http://127.0.0.1:8545';
    const response=await fetch(base+'/config',{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Local chain configuration is unavailable.');
    publicDeployment=await response.json();rpcUrl=base+'/rpc';
  }else throw new DomainError('Server chain reconciliation is not configured.','UNAVAILABLE');
  const deployment=walletDeployment(publicDeployment);
  if(configuration&&deployment.mode!=='testnet'||!configuration&&deployment.mode!=='local')throw new Error('Server chain configuration has the wrong network mode.');
  return {deployment,client:createPublicClient({transport:http(rpcUrl,{timeout:15000,retryCount:0}),cacheTime:0})};
}
