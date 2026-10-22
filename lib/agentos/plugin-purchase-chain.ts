import {AgentChainClient,centsToToken,escrowABI,type ChainIntent,type ChainEvidence} from '../../sdk/chain.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {PublicClient,Hex} from 'viem';
import type {PluginManifest,PluginExecution} from './plugin-protocol.ts';
import type {VaultSession} from './vault.ts';
import type {PluginPurchaseWorkflow,PluginPurchaseStep} from './plugin-purchase-protocol.ts';
import {DomainError} from './engine.ts';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export type PluginPurchaseChain=ReturnType<typeof createPluginPurchaseChain>;
export function createPluginPurchaseChain(client:PublicClient,deployment:WalletDeployment,localCall:(path:string,body:unknown)=>Promise<{hash:Hex}>){
 const chain=new AgentChainClient(client,deployment);
 async function intent(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep):Promise<ChainIntent>{if(!step.fundingIntent||!step.specHash)throw new DomainError('Plugin escrow intent is not committed.','FORBIDDEN');const {decimals}=await chain.validateDeployment();return {id:step.taskId,buyer:flow.vault.vault,seller:deployment.seller,amount:centsToToken(step.priceCents,decimals),deadline:BigInt(step.fundingIntent.deadline),specHash:step.specHash};}
 return {client,deployment,
  async view(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep){const [task,block]=await Promise.all([client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[step.taskId]}),client.getBlock()]);if(task[5]!==0){const expected=await intent(flow,step);if(!same(task[0],expected.buyer)||!same(task[1],expected.seller)||task[2]!==expected.amount||task[3]!==expected.deadline||task[4]!==expected.specHash)throw new DomainError('Existing plugin escrow differs from its immutable intent.','CONFLICT');}return {status:task[5],timestamp:block.timestamp,blockNumber:block.number.toString(),blockHash:block.hash!,outputHash:task[6]};},
  async funding(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep,hash?:Hex):Promise<ChainEvidence>{if(!hash){const logs=await client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:step.taskId},fromBlock:BigInt(deployment.deployedBlock)});if(logs.length!==1)throw new DomainError('Plugin funding event is unavailable.','UNAVAILABLE');hash=logs[0].transactionHash;}return chain.verifyEvidence(await intent(flow,step),hash,'funding');},
  async settlement(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep,hash?:Hex):Promise<ChainEvidence>{if(!hash){const logs=await client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName:'Settled',args:{id:step.taskId},fromBlock:BigInt(deployment.deployedBlock)});if(logs.length!==1)throw new DomainError('Plugin settlement event is unavailable.','UNAVAILABLE');hash=logs[0].transactionHash;}return chain.verifyEvidence(await intent(flow,step),hash,'settlement');},
  async fund(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep,manifest:PluginManifest,session:VaultSession){const {hash}=await localCall('/plugin-purchase/fund',{flow,index:step.index,manifest,session});return hash;},
  async settle(flow:PluginPurchaseWorkflow,step:PluginPurchaseStep,execution?:PluginExecution){const {hash}=await localCall('/plugin-purchase/settle',{id:step.taskId,mode:step.settlementIntent?.mode,execution});return hash;},
 };
}
