import {verifyOrderQuote} from '../lib/agentos/supplier-quote.ts';
import {orderSeller} from '../lib/agentos/order-parties.ts';
import { createPublicClient, createWalletClient, custom, defineChain, keccak256, stringToHex, type Address, type EIP1193Provider, type Hex,type PublicClient } from 'viem';
import { AgentChainClient, centsToToken, chainTaskId, tokenABI, escrowABI, validateChainDeployment, type ChainDeployment, type ChainEvidence, type ChainIntent, type TransactionIntent } from './chain.ts';
import { DATASET, verifyReceipt } from '../lib/agentos/engine.ts';
import { canonical,specHash,deliveryVerification,deliveryArtifact, type DeliverySpec } from '../cre/workflow/verify.ts';
import type { Task } from '../lib/agentos/types.ts';

export type WalletDeployment = ChainDeployment & {mode:'local'|'testnet';seller:Address;deployedBlock:string;identityRegistry?:Address;reputationRegistry?:Address;vault?:Address;vaultExecutor?:Address};
export function localWalletProvider(base:string,role:'buyer'|'seller'|'seller2'='buyer'):EIP1193Provider {
  const url=new URL(base);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Local test wallet requires a plain loopback endpoint.');
  return {request:async({method,params}: {method:string;params?:unknown})=>{
    const response=await fetch(url.origin+(role==='buyer'?'/rpc':role==='seller'?'/seller-rpc':'/seller2-rpc'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:AbortSignal.timeout(20000)});
    const result=await response.json() as {result:unknown;error?:{message?:string;code?:number}|string};
    const fault=typeof result.error==='string'?{message:result.error}:result.error;
    if(!response.ok||fault)throw Object.assign(new Error(fault?.message??'Local wallet RPC failed.'),{code:fault?.code});return result.result;
  }} as EIP1193Provider;
}
export function walletDeployment(value: unknown): WalletDeployment {
  if(!value||typeof value!=='object')throw new Error('Invalid wallet deployment.');
  const d=value as WalletDeployment;
  validateChainDeployment(d);
  if((d.mode==='local'?d.chainId!==31337:d.mode!=='testnet'||d.chainId!==11155111)||!/^0x[0-9a-fA-F]{40}$/.test(d.seller)||/^0x0{40}$/.test(d.seller)||!/^\d{1,20}$/.test(d.deployedBlock))throw new Error('Use local chain 31337 or Sepolia 11155111 with an actual seller and deployment block.');
  if(Boolean(d.vault)!==Boolean(d.vaultExecutor)||[d.vault,d.vaultExecutor].some(a=>a!==undefined&&(!/^0x[0-9a-fA-F]{40}$/.test(a)||/^0x0{40}$/.test(a))))throw new Error('Invalid Vault deployment.');
  if(d.mode==='testnet'&&!d.receiver)throw new Error('Public testnet requires a bound CRE receiver identity.');
  return {...d};
}
export const walletNamespace=(buyer:Address)=>'wallet:'+buyer.toLowerCase();
export function inputEvidence(task:Pick<Task,'id'|'input'> & Partial<Pick<Task,'skill'>>,buyer:Address){
  const id=chainTaskId(walletNamespace(buyer),task.id),rows=(task.input.records??DATASET).filter(row=>row.block>=task.input.blockFrom&&row.block<=task.input.blockTo),datasetText=JSON.stringify(task.input.memory?{version:'agentos.memory-evidence.v1',memory:task.input.memory,records:rows}:task.input.source?{version:'agentos.transfer-evidence.v1',source:task.input.source,records:rows}:rows);
  return {id,datasetText,datasetHash:keccak256(stringToHex(datasetText)),...(task.skill?{verification:deliveryVerification(task.skill,task.input)}:{})};
}
export function deliveryBytes(task: Task, buyer: Address) {
  if(!task.output)throw new Error('This task has no delivery artifact.');
  const bytes=inputEvidence(task,buyer),artifactText=JSON.stringify(deliveryArtifact(bytes.id,deliveryVerification(task.skill,task.input),bytes.datasetHash,task.output));
  return {...bytes,artifactText};
}
export class AgentWalletSession {
  readonly client:PublicClient;
  readonly signer;
  readonly chain;
  readonly account:Address;
  readonly deployment:WalletDeployment;
  private constructor(provider:EIP1193Provider,deployment:WalletDeployment,account:Address){
    this.account=account;this.deployment=walletDeployment(deployment);
    const network=defineChain({id:deployment.chainId,name:deployment.mode==='local'?'AgentOS local EVM':'Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}},testnet:true});
    this.client=createPublicClient({transport:custom(provider),cacheTime:0});
    this.signer=createWalletClient({transport:custom(provider),chain:network});
    this.chain=new AgentChainClient(this.client,deployment);
  }
  static async connect(provider:EIP1193Provider,deployment:WalletDeployment,requestAccess=true){
    walletDeployment(deployment);
    const signer=createWalletClient({transport:custom(provider)});
    const [account]=requestAccess?await signer.requestAddresses():await signer.getAddresses();
    if(!account)throw new Error('Wallet returned no account.');
    const session=new AgentWalletSession(provider,deployment,account);
    await session.assertSession();await session.chain.validateDeployment();return session;
  }
  async assertSession(){
    const [chainId,accounts]=await Promise.all([this.signer.getChainId(),this.signer.getAddresses()]);
    if(chainId!==this.deployment.chainId)throw new Error('Wallet network changed. Reconnect on the configured chain.');
    if(accounts[0]?.toLowerCase()!==this.account.toLowerCase())throw new Error('Wallet account changed. Reconnect before continuing.');
  }
  async balances(){
    await this.assertSession();const {decimals}=await this.chain.validateDeployment();
    const [native,balance]=await Promise.all([this.client.getBalance({address:this.account}),this.client.readContract({address:this.deployment.token,abi:tokenABI,functionName:'balanceOf',args:[this.account]})]);
    return {native:native.toString(),token:balance.toString(),decimals};
  }
  async task(task:Pick<Task,'id'|'quote'>,spec?:DeliverySpec){
    await this.assertSession();const {decimals}=await this.chain.validateDeployment();
    const id=chainTaskId(walletNamespace(this.account),task.id);
    const [buyer,seller,amount,deadline,commitment,status,outputHash]=await this.client.readContract({address:this.deployment.escrow,abi:escrowABI,functionName:'tasks',args:[id]});
    if(status===0)return {id,status:'unfunded' as const,intent:null,outputHash};
    if(buyer.toLowerCase()!==this.account.toLowerCase()||seller.toLowerCase()!==this.deployment.seller.toLowerCase()||amount!==centsToToken(task.quote,decimals)||spec&&commitment!==specHash(spec))throw new Error('Onchain task differs from the selected delivery or parties.');
    const intent:ChainIntent={id,buyer,seller,amount,deadline,specHash:commitment};
    return {id,status:status===1?'funded' as const:status===2?'paid' as const:'refunded' as const,intent,outputHash};
  }
  async send(transaction:TransactionIntent,onSubmitted?:(hash:Hex)=>void){
    await this.assertSession();
    const estimate=await this.client.estimateGas({...transaction,account:this.account});
    await this.assertSession();
    const hash=await this.signer.sendTransaction({...transaction,account:this.account,gas:estimate+estimate/5n});onSubmitted?.(hash);
    const receipt=await this.client.waitForTransactionReceipt({hash,confirmations:this.deployment.confirmations,timeout:60000,pollingInterval:500});
    if(receipt.status!=='success')throw new Error('Wallet transaction reverted.');return hash;
  }
  async fund(task:Task,spec:DeliverySpec,windowSeconds=3600,onSubmitted?:(hash:Hex)=>void):Promise<ChainEvidence>{
    if(task.status!=='completed'||!task.receipt||!await verifyReceipt(task.receipt))throw new Error('Only a completed task with a valid local receipt may be funded here.');
    if(!Number.isSafeInteger(windowSeconds)||windowSeconds<10||windowSeconds>604800)throw new Error('Escrow window must be 10–604800 seconds.');
    const bytes=deliveryBytes(task,this.account);if(bytes.datasetHash!==spec.datasetHash||canonical(spec.verification)!==canonical(bytes.verification))throw new Error('Evidence hash or verification does not match the selected task input.');
    await this.assertSession();
    const {intent,transactions}=await this.chain.prepareFunding({workspace:walletNamespace(this.account),taskId:task.id,buyer:this.account,seller:this.deployment.seller,quoteCents:task.quote,deadline:(await this.client.getBlock()).timestamp+BigInt(windowSeconds),spec});
    let hash:Hex|undefined;
    for(const transaction of transactions)hash=await this.send(transaction,onSubmitted);
    return this.chain.verifyEvidence(intent,hash!,'funding');
  }
  async fundOrder(order:import('../lib/agentos/orders.ts').ChainOrder,windowSeconds=3600,onSubmitted?:(hash:Hex)=>void){
    if(order.status!=='awaiting-funding'||order.funding||order.output||order.buyer.toLowerCase()!==this.account.toLowerCase()||canonical(order.deployment).toLowerCase()!==canonical(this.deployment).toLowerCase())throw new Error('Only the configured buyer may fund this unexecuted order.');
    if(!Number.isSafeInteger(windowSeconds)||windowSeconds<30||windowSeconds>604800)throw new Error('Order escrow window must be 30–604800 seconds.');
    const bytes=inputEvidence(order,this.account);if(bytes.datasetHash!==order.spec.datasetHash||canonical(order.spec.verification)!==canonical(bytes.verification))throw new Error('Order input commitment or verification differs.');
    await verifyOrderQuote(order,Number((await this.client.getBlock()).timestamp));
    if(order.executor==='supplier'&&orderSeller(order).toLowerCase()!==this.deployment.seller.toLowerCase()){if(!order.agentIdentity||!order.supplier)throw new Error('A verified supplier identity is required.');await(await import('../lib/agentos/supplier-chain.ts')).authorizeSupplier(this.client,this.deployment,order.agentIdentity,order.supplier);}
    const {intent,transactions}=await this.chain.prepareFunding({workspace:walletNamespace(this.account),taskId:order.id,buyer:this.account,seller:orderSeller(order),quoteCents:order.quote,deadline:(await this.client.getBlock()).timestamp+BigInt(windowSeconds),spec:order.spec});
    let hash:Hex|undefined;for(const transaction of transactions)hash=await this.send(transaction,onSubmitted);
    return this.chain.verifyEvidence(intent,hash!,'funding');
  }
  async refund(task:Pick<Task,'id'|'quote'>,onSubmitted?:(hash:Hex)=>void){
    const current=await this.task(task);if(current.status!=='funded')throw new Error('No funded escrow is available to refund.');
    if((await this.client.getBlock()).timestamp<current.intent!.deadline)throw new Error('Escrow deadline has not passed.');
    const hash=await this.send(this.chain.refundTransaction(current.id),onSubmitted);
    return this.chain.verifyEvidence(current.intent!,hash,'settlement');
  }
  async evidence(task:Pick<Task,'id'|'quote'>,hash:Hex,phase:'funding'|'settlement',spec?:DeliverySpec){
    const current=await this.task(task,spec);if(!current.intent)throw new Error('Task is not funded.');
    return this.chain.verifyEvidence(current.intent,hash,phase);
  }
  async signReconciliation(message:string){
    if(!message.startsWith('AgentOS chain reconciliation v1\n')||message.length>16384||!message.includes(`Buyer: ${this.account}`))throw new Error('Unexpected reconciliation message.');
    await this.assertSession();
    return this.signer.signMessage({account:this.account,message});
  }
}
