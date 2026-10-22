import {createPublicClient,http} from 'viem';
import {serverChain} from './chain-config.ts';
import {validateRegistries,type IdentityDeployment} from './identity.ts';
/** Identity-only Sepolia configuration never enables escrow funding or settlement. */
export async function serverIdentityChain(request:Request,configuration?:string,chainConfiguration?:string){
 if(!configuration)return serverChain(request,chainConfiguration);
 const value=JSON.parse(configuration);
 if(Object.keys(value).sort().join(',')!=='chainId,confirmations,identityRegistry,reputationRegistry,rpcUrl'||value.chainId!==11155111||!Number.isInteger(value.confirmations)||value.confirmations<2||value.confirmations>100)throw Error('Invalid Sepolia identity configuration.');
 const url=new URL(value.rpcUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('An HTTPS identity RPC is required.');
 const deployment:IdentityDeployment={chainId:value.chainId,confirmations:value.confirmations,identityRegistry:value.identityRegistry,reputationRegistry:value.reputationRegistry};
 const client=createPublicClient({transport:http(url.href,{timeout:20000,retryCount:1}),cacheTime:0});await validateRegistries(client,deployment);return {client,deployment,rpcUrl:url.href};
}
