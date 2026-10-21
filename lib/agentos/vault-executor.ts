import {authorizeSupplier} from './supplier-chain.ts';
import {verifyOrderQuote} from './supplier-quote.ts';
import {orderSeller} from './order-parties.ts';
import {createWalletClient,http,defineChain,type Hex,type PublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData} from 'viem';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import {centsToToken,escrowABI} from '../../sdk/chain.ts';
import {inputEvidence} from '../../sdk/wallet.ts';
import {specHash} from '../../cre/workflow/verify.ts';
import {checkVaultBinding,assertVaultSeller,vaultABI} from './vault.ts';
import {DomainError} from './engine.ts';
import type {ChainOrder} from './orders.ts';
export type VaultFunder=(order:ChainOrder)=>Promise<Hex>;
/** Reconcile an existing principal transfer before considering another transaction. */
export function vaultFunder(client:PublicClient,deployment:WalletDeployment,send:(order:ChainOrder,data:Hex)=>Promise<Hex>):VaultFunder{
 return async order=>{
  if(!order.vault||!order.vaultFunding)throw new DomainError('A committed Vault funding intent is required.','FORBIDDEN');
  const bytes=inputEvidence(order,order.buyer),task=await client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[bytes.id]});
  if(task[5]!==0){
   if(task[0].toLowerCase()!==order.vault.vault.toLowerCase()||task[1].toLowerCase()!==orderSeller(order).toLowerCase()||task[4]!==specHash(order.spec)||task[3].toString()!==order.vaultFunding.deadline)throw new DomainError('Existing Vault escrow differs from its intent.','CONFLICT');
   const events=await client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:bytes.id},fromBlock:BigInt(deployment.deployedBlock)});
   if(events.length!==1)throw new DomainError('Vault funding event is unavailable.','UNAVAILABLE');return events[0].transactionHash;
  }
  assertVaultSeller(order.vault,orderSeller(order));
  const view=await checkVaultBinding(client,deployment,order.vault),amount=centsToToken(order.quote,view.decimals),deadline=BigInt(order.vaultFunding.deadline);
  await verifyOrderQuote(order,Number(view.now));
  if(order.executor==='supplier'){if(!order.agentIdentity||!order.supplier)throw new DomainError('An authorized supplier is required.','FORBIDDEN');await authorizeSupplier(client,deployment,order.agentIdentity,order.supplier);}
  if(deadline<=view.now||deadline>view.now+86400n||view.balance<amount||view.spent+amount>view.grant[1])throw new DomainError('Vault balance, deadline or daily allowance does not permit funding.','FORBIDDEN');
  return send(order,encodeFunctionData({abi:vaultABI,functionName:'execute',args:[bytes.id,orderSeller(order),amount,deadline,specHash(order.spec)]}));
 };
}
/** Key is server-only; neither the SDK nor a model receives it. */
export function privateVaultSender(client:PublicClient,deployment:WalletDeployment,rpcUrl:string,key:string){
 if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw new DomainError('Vault executor is not configured.','UNAVAILABLE');
 const account=privateKeyToAccount(key as Hex);
 if(!deployment.vaultExecutor||account.address.toLowerCase()!==deployment.vaultExecutor.toLowerCase())throw new DomainError('Vault executor does not match the configured address.','UNAVAILABLE');
 const chain=defineChain({id:deployment.chainId,name:'AgentOS configured network',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpcUrl]}},testnet:true}),wallet=createWalletClient({account,chain,transport:http(rpcUrl)});
 return async(_order:ChainOrder,data:Hex)=>{const hash=await wallet.sendTransaction({to:deployment.vault!,data});const receipt=await client.waitForTransactionReceipt({hash,confirmations:deployment.confirmations,timeout:60000,pollingInterval:500});if(receipt.status!=='success')throw new DomainError('Vault execution transaction reverted.','UNAVAILABLE');return hash;};
}
