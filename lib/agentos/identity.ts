import { decodeEventLog,encodeFunctionData,keccak256,stringToHex,type Address,type Hex,type PublicClient } from 'viem';
import { identityABI,reputationABI,registrationDocument,registrationDataURI,completeRegistrationDocument } from '../../sdk/identity.ts';
import type { WalletDeployment } from '../../sdk/wallet.ts';
import { inputEvidence } from '../../sdk/wallet.ts';
import { canonical } from '../../cre/workflow/verify.ts';
import { digest,DomainError } from './engine.ts';
import { findOrder } from './orders.ts';
import { orderChain } from './order-chain.ts';
import type { Workspace } from './types.ts';

export type AgentIdentity={agentId:string;chainId:number;registry:Address;reputationRegistry:Address;registryAgentId:string;owner:Address;wallet:Address;agentURI:string;documentHash:Hex;registrationTx:Hex;registrationBlock:string;registrationBlockHash:Hex;checkedBlock:string;checkedBlockHash:Hex;checkedAt:string;status:'verified'|'stale'};
export type IdentityChallenge={nonce:string;message:string;identity:AgentIdentity;expiresAt:string;usedAt?:string};
export type PaidFeedback={orderId:string;identity:AgentIdentity;buyer:Address;score:number;feedbackURI:string;feedbackHash:Hex;tag2:string;endpoint:string;preparedAt:string;status:'awaiting-chain'|'active'|'revoked'|'unavailable';transactionHash?:Hex;blockNumber?:string;blockHash?:Hex;feedbackIndex?:string;checkedAt?:string};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export const dataJSON=registrationDataURI;
export function registryAddresses(deployment:WalletDeployment){
 const {identityRegistry,reputationRegistry}=deployment;
 if(![identityRegistry,reputationRegistry].every(a=>typeof a==='string'&&/^0x[0-9a-fA-F]{40}$/.test(a)&&!/^0x0{40}$/.test(a)))throw new DomainError('Identity registries are not configured.','UNAVAILABLE');
 return {registry:identityRegistry!,reputationRegistry:reputationRegistry!};
}
export async function identityDocument(state:Workspace,ownerId:string,agentId:string,origin:string){
 const agent=state.agents.find(a=>a.id===agentId);if(!agent)throw new DomainError('Agent not found.','NOT_FOUND');
 const document={...registrationDocument({name:agent.name,description:agent.description,image:origin+'/favicon.svg',webEndpoint:origin}),supportedTrust:['reputation'],agentos:{version:1,workspaceHash:await digest({ownerId}),localAgentId:agent.id,skill:agent.skill}};
 return {document,agentURI:dataJSON(document)};
}
export async function validateRegistries(client:PublicClient,deployment:WalletDeployment){
 const {registry,reputationRegistry}=registryAddresses(deployment);
 const [chainId,identityCode,reputationCode,linked]=await Promise.all([client.getChainId(),client.getCode({address:registry}),client.getCode({address:reputationRegistry}),client.readContract({address:reputationRegistry,abi:reputationABI,functionName:'getIdentityRegistry'})]);
 if(chainId!==deployment.chainId||!identityCode||identityCode==='0x'||!reputationCode||reputationCode==='0x'||!same(linked,registry))throw new DomainError('Registry deployment identity differs from configuration.','CONFLICT');
 return {registry,reputationRegistry};
}
async function canonicalReceipt(client:PublicClient,hash:Hex,confirmations:number){
 const receipt=await client.getTransactionReceipt({hash}),[block,latest]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),client.getBlockNumber()]);
 if(receipt.status!=='success'||block.hash!==receipt.blockHash||latest-receipt.blockNumber+1n<BigInt(confirmations))throw new DomainError('A confirmed canonical registry transaction is required.','CONFLICT');
 return receipt;
}
export async function inspectIdentity(client:PublicClient,deployment:WalletDeployment,identity:AgentIdentity){
 const addresses=await validateRegistries(client,deployment);
 if(identity.chainId!==deployment.chainId||!same(identity.registry,addresses.registry)||!same(identity.reputationRegistry,addresses.reputationRegistry))throw new DomainError('Identity network differs from configuration.','CONFLICT');
 const block=await client.getBlock(),args=[BigInt(identity.registryAgentId)] as const,base={address:identity.registry,abi:identityABI,args,blockNumber:block.number};
 const [owner,wallet,uri,registration]=await Promise.all([client.readContract({...base,functionName:'ownerOf'}),client.readContract({...base,functionName:'getAgentWallet'}),client.readContract({...base,functionName:'tokenURI'}),client.getBlock({blockNumber:BigInt(identity.registrationBlock)})]);
 if(registration.hash!==identity.registrationBlockHash||!same(owner,identity.owner)||!same(wallet,identity.wallet)||!same(wallet,deployment.seller)||uri!==identity.agentURI)throw new DomainError('Identity ownership, payment wallet or registration document changed. Rebind before new orders.','CONFLICT');
 return {...identity,status:'verified' as const,checkedAt:new Date().toISOString(),checkedBlock:block.number.toString(),checkedBlockHash:block.hash!};
}
export async function verifyRegistration(state:Workspace,ownerId:string,agentId:string,registryAgentId:string,transactionHash:Hex,origin:string,client:PublicClient,deployment:WalletDeployment):Promise<AgentIdentity>{
 const {registry,reputationRegistry}=await validateRegistries(client,deployment),draft=await identityDocument(state,ownerId,agentId,origin),receipt=await canonicalReceipt(client,transactionHash,deployment.confirmations);
 const agentURI=dataJSON(completeRegistrationDocument(draft.document,deployment.chainId,registry,registryAgentId));
 const event=receipt.logs.filter(l=>same(l.address,registry)).map(l=>{try{return decodeEventLog({abi:identityABI,eventName:'Registered',data:l.data,topics:l.topics}).args;}catch{return null;}}).find(e=>e?.agentId===BigInt(registryAgentId)&&e.agentURI===draft.agentURI);
 if(!event)throw new DomainError('Registration transaction does not bind this workspace profile.','CONFLICT');
 const owner=await client.readContract({address:registry,abi:identityABI,functionName:'ownerOf',args:[BigInt(registryAgentId)]});
 const identity:AgentIdentity={agentId,chainId:deployment.chainId,registry,reputationRegistry,registryAgentId,owner,wallet:deployment.seller,agentURI,documentHash:keccak256(stringToHex(agentURI)),registrationTx:transactionHash,registrationBlock:receipt.blockNumber.toString(),registrationBlockHash:receipt.blockHash,checkedBlock:receipt.blockNumber.toString(),checkedBlockHash:receipt.blockHash,checkedAt:new Date().toISOString(),status:'verified'};
 return inspectIdentity(client,deployment,identity);
}
export async function createIdentityChallenge(state:Workspace,ownerId:string,identity:AgentIdentity,nonce:string,now=new Date().toISOString()){
 if((state.identityChallenges??[]).filter(c=>c.expiresAt>now&&!c.usedAt).length>=30)throw new DomainError('Too many pending identity challenges.');
 const expiresAt=new Date(Date.parse(now)+300000).toISOString(),message=['AgentOS identity binding v1',`Workspace: ${await digest({ownerId})}`,`Agent: ${identity.agentId}`,`Identity: eip155:${identity.chainId}:${identity.registry}:${identity.registryAgentId}`,`Owner: ${identity.owner}`,`Payment wallet: ${identity.wallet}`,`Document: ${identity.documentHash}`,`Nonce: ${nonce}`,`Expires: ${expiresAt}`].join('\n');
 const challenge:IdentityChallenge={nonce,message,identity,expiresAt};return {...state,identityChallenges:[...(state.identityChallenges??[]).filter(c=>c.expiresAt>now),challenge]};
}
export function bindIdentity(state:Workspace,nonce:string,verified:AgentIdentity,now=new Date().toISOString()){
 const challenge=state.identityChallenges?.find(c=>c.nonce===nonce);if(!challenge)throw new DomainError('Identity challenge not found.','NOT_FOUND');
 if(canonical({...challenge.identity,checkedAt:'',checkedBlock:'',checkedBlockHash:''})!==canonical({...verified,checkedAt:'',checkedBlock:'',checkedBlockHash:''}))throw new DomainError('Identity differs from the signed challenge.','CONFLICT');
 const previous=state.agentIdentities?.find(i=>i.agentId===verified.agentId);
 if(challenge.usedAt){if(previous?.documentHash===verified.documentHash&&previous.registryAgentId===verified.registryAgentId)return state;throw new DomainError('Identity challenge was already consumed.','CONFLICT');}
 if(challenge.expiresAt<=now)throw new DomainError('Identity challenge expired.','CONFLICT');
 if(state.agentIdentities?.some(i=>i.agentId!==verified.agentId&&i.chainId===verified.chainId&&same(i.registry,verified.registry)&&i.registryAgentId===verified.registryAgentId))throw new DomainError('This registry identity is already bound to another profile.','CONFLICT');
 const next=structuredClone(state);next.identityChallenges!.find(c=>c.nonce===nonce)!.usedAt=now;next.agentIdentities=[...(next.agentIdentities??[]).filter(i=>i.agentId!==verified.agentId),verified];return next;
}
export async function prepareFeedback(state:Workspace,orderId:string,score:number,client:PublicClient,deployment:WalletDeployment):Promise<PaidFeedback>{
 const order=findOrder(state,orderId),existing=state.agentFeedback?.find(f=>f.orderId===orderId);
 if(existing){if(existing.score!==score)throw new DomainError('Feedback was already committed with a different score. Reconcile the existing intent.','IDEMPOTENCY_CONFLICT');if(existing.transactionHash)return existing;}
 if(!Number.isInteger(score)||score<0||score>100)throw new DomainError('Feedback score must be 0–100.');
 if(!order.agentIdentity||order.settlement?.status!=='paid'||!['completed','paused'].includes(order.status))throw new DomainError('Feedback requires an identity-bound paid order.','CONFLICT');
 const identity=await inspectIdentity(client,deployment,order.agentIdentity);if(await client.readContract({address:identity.registry,abi:identityABI,functionName:'isAuthorizedOrOwner',args:[order.buyer,BigInt(identity.registryAgentId)]}))throw new DomainError('Agent owners and operators cannot review themselves.','FORBIDDEN');
 const payment=await orderChain(client,deployment).settlement(order,order.settlement.transactionHash);if(payment.status!=='paid'||!same(payment.seller,identity.wallet))throw new DomainError('Payment does not match the agent identity.','CONFLICT');
 if(existing)return existing;
 const tag2=inputEvidence(order,order.buyer).id,endpoint=`agentos://paid-order/${deployment.chainId}/${deployment.escrow}/${tag2}`;
 const document={agentRegistry:`eip155:${identity.chainId}:${identity.registry}`,agentId:identity.registryAgentId,clientAddress:`eip155:${identity.chainId}:${order.buyer}`,value:score,valueDecimals:0,tag1:'starred',tag2,proofOfPayment:{chainId:String(payment.chainId),fromAddress:payment.buyer,toAddress:payment.seller,txHash:payment.transactionHash,escrow:payment.escrow,taskId:payment.taskId},outputHash:payment.outputHash};
 const feedbackURI=dataJSON(document);return {orderId,identity,buyer:order.buyer,score,feedbackURI,feedbackHash:keccak256(stringToHex(JSON.stringify(document))),tag2,endpoint,preparedAt:new Date().toISOString(),status:'awaiting-chain'};
}
export function feedbackTransaction(intent:PaidFeedback){return {to:intent.identity.reputationRegistry,data:encodeFunctionData({abi:reputationABI,functionName:'giveFeedback',args:[BigInt(intent.identity.registryAgentId),BigInt(intent.score),0,'starred',intent.tag2,intent.endpoint,intent.feedbackURI,intent.feedbackHash]})};}
export function saveFeedbackIntent(state:Workspace,intent:PaidFeedback){const previous=state.agentFeedback?.find(f=>f.orderId===intent.orderId);if(previous){if(previous.feedbackHash!==intent.feedbackHash)throw new DomainError('Feedback already exists with different content.','IDEMPOTENCY_CONFLICT');return state;}if((state.agentFeedback?.length??0)>=300)throw new DomainError('Feedback history is full.');return {...state,agentFeedback:[...(state.agentFeedback??[]),intent]};}
export async function verifyFeedback(state:Workspace,orderId:string,hash:Hex,client:PublicClient,deployment:WalletDeployment):Promise<PaidFeedback>{
 const intent=state.agentFeedback?.find(f=>f.orderId===orderId);if(!intent)throw new DomainError('Feedback intent not found.','NOT_FOUND');
 await validateRegistries(client,deployment);const receipt=await canonicalReceipt(client,hash,deployment.confirmations),order=findOrder(state,orderId);
 if(!order.settlement||order.settlement.status!=='paid')throw new DomainError('A paid order is required.','CONFLICT');await orderChain(client,deployment).settlement(order,order.settlement.transactionHash);
 const event=receipt.logs.filter(l=>same(l.address,intent.identity.reputationRegistry)).map(l=>{try{return decodeEventLog({abi:reputationABI,eventName:'NewFeedback',data:l.data,topics:l.topics}).args;}catch{return null;}}).find(e=>e?.agentId===BigInt(intent.identity.registryAgentId)&&same(e.clientAddress,intent.buyer)&&e.value===BigInt(intent.score)&&e.valueDecimals===0&&e.tag1==='starred'&&e.tag2===intent.tag2&&e.endpoint===intent.endpoint&&e.feedbackURI===intent.feedbackURI&&e.feedbackHash===intent.feedbackHash);
 if(!event)throw new DomainError('Feedback event does not match the authorized buyer and paid order.','CONFLICT');
 const [owner,wallet]=await Promise.all([client.readContract({address:intent.identity.registry,abi:identityABI,functionName:'ownerOf',args:[BigInt(intent.identity.registryAgentId)],blockNumber:receipt.blockNumber}),client.readContract({address:intent.identity.registry,abi:identityABI,functionName:'getAgentWallet',args:[BigInt(intent.identity.registryAgentId)],blockNumber:receipt.blockNumber})]);
 if(!same(owner,intent.identity.owner)||!same(wallet,intent.identity.wallet))throw new DomainError('Identity changed before feedback was recorded.','CONFLICT');
 const current=await client.readContract({address:intent.identity.reputationRegistry,abi:reputationABI,functionName:'readFeedback',args:[BigInt(intent.identity.registryAgentId),intent.buyer,event.feedbackIndex]});
 return {...intent,status:current[4]?'revoked':'active',transactionHash:hash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,feedbackIndex:event.feedbackIndex.toString(),checkedAt:new Date().toISOString()};
}
export function saveFeedback(state:Workspace,verified:PaidFeedback){
 const previous=state.agentFeedback?.find(f=>f.orderId===verified.orderId);if(!previous||previous.feedbackHash!==verified.feedbackHash)throw new DomainError('Feedback intent changed.','CONFLICT');
 if(previous.transactionHash&&previous.transactionHash!==verified.transactionHash)throw new DomainError('This paid order already has a reconciled feedback transaction.','CONFLICT');
 return {...state,agentFeedback:state.agentFeedback!.map(f=>f.orderId===verified.orderId?verified:f)};
}
