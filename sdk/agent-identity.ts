import { decodeEventLog,encodeFunctionData,type Hex } from 'viem';
import { identityABI,reputationABI,registrationTransaction,registrationDataURI,completeRegistrationDocument } from './identity.ts';
import type { AgentWalletSession,WalletDeployment } from './wallet.ts';
import type { AgentIdentity,IdentityChallenge,PaidFeedback } from '../lib/agentos/identity.ts';
import { canonical } from '../cre/workflow/verify.ts';
import { supplierMetadata,SUPPLIER_METADATA_KEY,type SupplierDescriptor } from '../lib/agentos/supplier.ts';

/** Wallet signs registry calls; API independently verifies chain evidence before saving. */
export class AgentIdentityClient {
 readonly session:AgentWalletSession;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(session:AgentWalletSession,baseURL='',headers:Record<string,string>={}){this.session=session;this.baseURL=baseURL;this.headers=headers;}
 async post<T=unknown>(body:unknown):Promise<T>{const r=await fetch(this.baseURL+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',...this.headers},credentials:'include',body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const value=await r.json() as T & {error?:string};if(!r.ok)throw new Error(value.error??'Identity operation failed.');return value;}
 private deployment(deployment:WalletDeployment){if(canonical(deployment).toLowerCase()!==canonical(this.session.deployment).toLowerCase())throw new Error('Registry configuration differs from the connected wallet.');}
 private async send(to:`0x${string}`,data:Hex){
  await this.session.assertSession();const gas=await this.session.client.estimateGas({to,data,account:this.session.account});await this.session.assertSession();
  const hash=await this.session.signer.sendTransaction({to,data,gas:gas+gas/5n,account:this.session.account});const receipt=await this.session.client.waitForTransactionReceipt({hash,confirmations:this.session.deployment.confirmations,timeout:60000,pollingInterval:500});if(receipt.status!=='success')throw new Error('Registry transaction reverted.');return receipt;
 }
 async register(agentId:string){
  const prepared=await this.post<{document:Record<string,unknown>;agentURI:string;deployment:WalletDeployment}>({action:'prepare',agentId});this.deployment(prepared.deployment);
  if(!prepared.deployment.identityRegistry)throw new Error('Identity registries are not configured.');
  const prior=await this.session.client.getContractEvents({address:prepared.deployment.identityRegistry,abi:identityABI,eventName:'Registered',args:{owner:this.session.account},fromBlock:BigInt(prepared.deployment.deployedBlock)});
  let found;
  for(const candidate of prior.filter(l=>l.args.agentURI===prepared.agentURI).reverse())if(candidate.args.agentId!==undefined&&(await this.session.client.readContract({address:prepared.deployment.identityRegistry,abi:identityABI,functionName:'ownerOf',args:[candidate.args.agentId]})).toLowerCase()===this.session.account.toLowerCase()){found=candidate;break;}
  const complete=async(registryAgentId:string,transactionHash:Hex)=>{const uri=registrationDataURI(completeRegistrationDocument(prepared.document,prepared.deployment.chainId,prepared.deployment.identityRegistry!,registryAgentId));if(await this.session.client.readContract({address:prepared.deployment.identityRegistry!,abi:identityABI,functionName:'tokenURI',args:[BigInt(registryAgentId)]})!==uri)await this.send(prepared.deployment.identityRegistry!,encodeFunctionData({abi:identityABI,functionName:'setAgentURI',args:[BigInt(registryAgentId),uri]}));return {registryAgentId,transactionHash};};
  if(found)return complete(String(found.args.agentId),found.transactionHash!);
  const tx=registrationTransaction(prepared.deployment.identityRegistry,prepared.agentURI),receipt=await this.send(tx.to,tx.data);
  const event=receipt.logs.filter(l=>l.address.toLowerCase()===tx.to.toLowerCase()).map(l=>{try{return decodeEventLog({abi:identityABI,eventName:'Registered',data:l.data,topics:l.topics}).args;}catch{return null;}}).find(e=>e?.agentURI===prepared.agentURI&&e.owner.toLowerCase()===this.session.account.toLowerCase());
  if(!event)throw new Error('Registration event is missing. Reconcile the existing transaction.');return complete(event.agentId.toString(),receipt.transactionHash);
 }
 async bind(agentId:string,registryAgentId:string,transactionHash:Hex){
  const {challenge}=await this.post<{challenge:IdentityChallenge}>({action:'challenge',agentId,registryAgentId,transactionHash});
  if(!challenge.message.startsWith('AgentOS identity binding v1\n')||!challenge.message.includes(`Owner: ${this.session.account}`)||challenge.identity.agentId!==agentId||challenge.identity.registryAgentId!==registryAgentId||challenge.identity.registry.toLowerCase()!==this.session.deployment.identityRegistry?.toLowerCase())throw new Error('Identity challenge differs from the selected profile or wallet.');
  await this.session.assertSession();const signature=await this.session.signer.signMessage({account:this.session.account,message:challenge.message});return this.post({action:'bind',nonce:challenge.nonce,signature});
 }
 async registerAndBind(agentId:string){const registered=await this.register(agentId);await this.bind(agentId,registered.registryAgentId,registered.transactionHash);return registered;}
 async authorizeSupplier(identity:AgentIdentity,descriptor:SupplierDescriptor|null){
  if(identity.owner.toLowerCase()!==this.session.account.toLowerCase()||identity.registry.toLowerCase()!==this.session.deployment.identityRegistry?.toLowerCase()||identity.chainId!==this.session.deployment.chainId)throw new Error('Connect the registry owner wallet to authorize a skill supplier.');
  const value=descriptor?supplierMetadata(descriptor):'0x';await this.send(identity.registry,encodeFunctionData({abi:identityABI,functionName:'setMetadata',args:[BigInt(identity.registryAgentId),SUPPLIER_METADATA_KEY,value]}));
  const current=await this.session.client.readContract({address:identity.registry,abi:identityABI,functionName:'getMetadata',args:[BigInt(identity.registryAgentId),SUPPLIER_METADATA_KEY]});if(current.toLowerCase()!==value.toLowerCase())throw new Error('Supplier delegation read-back differs from the signed transaction.');
 }
 async feedback(orderId:string,score:number){
  const {intent,deployment}=await this.post<{intent:PaidFeedback;deployment:WalletDeployment}>({action:'feedback-prepare',orderId,score});this.deployment(deployment);
  if(intent.orderId!==orderId||intent.score!==score||intent.buyer.toLowerCase()!==this.session.account.toLowerCase()||intent.identity.reputationRegistry.toLowerCase()!==deployment.reputationRegistry?.toLowerCase())throw new Error('Feedback differs from the authorized buyer and order.');
  let hash=intent.transactionHash;
  if(!hash){
   const logs=await this.session.client.getContractEvents({address:intent.identity.reputationRegistry,abi:reputationABI,eventName:'NewFeedback',args:{agentId:BigInt(intent.identity.registryAgentId),clientAddress:this.session.account},fromBlock:BigInt(deployment.deployedBlock)}),existing=logs.find(l=>l.args.feedbackHash===intent.feedbackHash&&l.args.tag2===intent.tag2);
   hash=existing?.transactionHash??(await this.send(intent.identity.reputationRegistry,encodeFunctionData({abi:reputationABI,functionName:'giveFeedback',args:[BigInt(intent.identity.registryAgentId),BigInt(intent.score),0,'starred',intent.tag2,intent.endpoint,intent.feedbackURI,intent.feedbackHash]}))).transactionHash;
  }
  await this.post({action:'feedback-confirm',orderId,transactionHash:hash});return hash;
 }
 async revoke(feedback:PaidFeedback){
  if(!feedback.feedbackIndex||!feedback.transactionHash||feedback.buyer.toLowerCase()!==this.session.account.toLowerCase())throw new Error('Only the original reviewer may revoke this feedback.');
  await this.send(feedback.identity.reputationRegistry,encodeFunctionData({abi:reputationABI,functionName:'revokeFeedback',args:[BigInt(feedback.identity.registryAgentId),BigInt(feedback.feedbackIndex)]}));return this.post({action:'feedback-confirm',orderId:feedback.orderId,transactionHash:feedback.transactionHash});
 }
}
export type { AgentIdentity,PaidFeedback };
