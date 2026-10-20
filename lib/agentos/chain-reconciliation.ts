import { keccak256, stringToHex, type Address, type Hex, type PublicClient } from 'viem';
import { AgentChainClient, centsToToken, escrowABI, type ChainEvidence, type ChainIntent } from '../../sdk/chain.ts';
import { deliveryBytes, walletNamespace, type WalletDeployment } from '../../sdk/wallet.ts';
import { canonical, specHash, type DeliverySpec } from '../../cre/workflow/verify.ts';
import { digest, DomainError, verifyReceipt } from './engine.ts';
import type { Task, Workspace } from './types.ts';

export type ChainClaim = {taskId:string;buyer:Address;chainId:number;escrow:Address;transactionHash:Hex;phase:'funding'|'settlement';spec:DeliverySpec};
export type ChainChallenge = {nonce:string;message:string;claim:ChainClaim;deployment:WalletDeployment;taskDigest:string;expiresAt:string;usedAt?:string};
export type SavedChainReceipt = {id:string;webTaskId:string;agentId:string;deployment:WalletDeployment;evidence:ChainEvidence;verifiedAt:string};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const receiptId=(e:ChainEvidence)=>[e.chainId,e.escrow.toLowerCase(),e.transactionHash.toLowerCase(),e.phase].join(':');
async function completedTask(state:Workspace,id:string) {
  const task=state.tasks.find(t=>t.id===id);
  if(!task)throw new DomainError('Task not found.','NOT_FOUND');
  if(task.status!=='completed'||!task.output||!task.receipt||!await verifyReceipt(task.receipt)||task.receipt.taskId!==task.id||task.receipt.agentId!==task.agentId||task.receipt.amount!==task.quote||task.receipt.outputHash!==await digest(task.output)||task.receipt.inputHash!==await digest(task.input))throw new DomainError('Reconciliation requires a completed task with a matching valid receipt.');
  return task;
}
const taskDigest=(task:Task)=>digest({id:task.id,agentId:task.agentId,quote:task.quote,input:task.input,output:task.output,receipt:task.receipt});
export function matchingDeployment(a:WalletDeployment,b:WalletDeployment) {return canonical(a).toLowerCase()===canonical(b).toLowerCase();}
export async function createChainChallenge(state:Workspace,ownerId:string,claim:ChainClaim,deployment:WalletDeployment,nonce:string,now=new Date().toISOString()) {
  const task=await completedTask(state,claim.taskId);
  if(claim.chainId!==deployment.chainId||!same(claim.escrow,deployment.escrow))throw new DomainError('This deployment is not enabled for server reconciliation.','FORBIDDEN');
  const bytes=deliveryBytes(task,claim.buyer);
  if(bytes.datasetHash!==claim.spec.datasetHash||claim.spec.verification&&canonical(claim.spec.verification)!==canonical(bytes.verification))throw new DomainError('Evidence does not match this task input.');
  const expiresAt=new Date(Date.parse(now)+300000).toISOString(),scope=await digest({ownerId});
  const message=['AgentOS chain reconciliation v1','This signature records a receipt; it does not transfer tokens.',`Workspace: ${scope}`,`Nonce: ${nonce}`,`Expires: ${expiresAt}`,`Task: ${claim.taskId}`,`Chain task: ${bytes.id}`,`Wallet namespace: ${walletNamespace(claim.buyer)}`,`Buyer: ${claim.buyer}`,`Transaction: ${claim.transactionHash}`,`Phase: ${claim.phase}`,`Specification: ${specHash(claim.spec)}`,`Deployment: ${canonical(deployment)}`].join('\n');
  const challenge:ChainChallenge={nonce,message,claim:structuredClone(claim),deployment:{...deployment},taskDigest:await taskDigest(task),expiresAt};
  return {challenge,state:{...state,chainChallenges:[...(state.chainChallenges??[]).filter(c=>c.expiresAt>now).slice(-39),challenge]}};
}
export async function verifyChainClaim(state:Workspace,nonce:string,signature:Hex,deployment:WalletDeployment,client:PublicClient,now=new Date().toISOString()) {
  const challenge=state.chainChallenges?.find(c=>c.nonce===nonce);
  if(!challenge)throw new DomainError('Reconciliation challenge not found.','NOT_FOUND');
  if(challenge.expiresAt<=now)throw new DomainError('Reconciliation challenge expired. Request a new signature.');
  if(!matchingDeployment(challenge.deployment,deployment))throw new DomainError('Server deployment changed. Request a new challenge.','CONFLICT');
  const task=await completedTask(state,challenge.claim.taskId);
  if(await taskDigest(task)!==challenge.taskDigest)throw new DomainError('Task changed after the challenge was issued.','CONFLICT');
  if(!await client.verifyMessage({address:challenge.claim.buyer,message:challenge.message,signature}))throw new DomainError('Wallet signature does not authorize this workspace receipt.','FORBIDDEN');
  const claim=challenge.claim,chain=new AgentChainClient(client,deployment),{decimals}=await chain.validateDeployment(),bytes=deliveryBytes(task,claim.buyer);
  const onchain=await client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[bytes.id]});
  const intent:ChainIntent={id:bytes.id,buyer:claim.buyer,seller:deployment.seller,amount:centsToToken(task.quote,decimals),deadline:onchain[3],specHash:specHash(claim.spec)};
  const evidence=await chain.verifyEvidence(intent,claim.transactionHash,claim.phase);
  if(evidence.status==='paid'&&evidence.outputHash!==keccak256(stringToHex(canonical(claim.spec.verification?JSON.parse(bytes.artifactText):{taskId:bytes.id,totalCents:task.output!.totalCents,transferCount:task.output!.transferCount}))))throw new DomainError('Paid output differs from the completed task delivery.');
  return {challenge,record:{id:receiptId(evidence),webTaskId:task.id,agentId:task.agentId,deployment:{...deployment},evidence,verifiedAt:now} satisfies SavedChainReceipt};
}
/** Accepts only server-verified evidence; never exposed through /api/command. */
export async function saveChainReceipt(state:Workspace,challenge:ChainChallenge,record:SavedChainReceipt,now=new Date().toISOString()):Promise<Workspace> {
  const current=state.chainChallenges?.find(c=>c.nonce===challenge.nonce);
  if(!current||current.message!==challenge.message)throw new DomainError('Reconciliation challenge no longer exists.','CONFLICT');
  if(current.expiresAt<=now)throw new DomainError('Reconciliation challenge expired. Request a new signature.');
  const task=await completedTask(state,record.webTaskId);
  if(await taskDigest(task)!==current.taskDigest)throw new DomainError('Task changed during reconciliation.','CONFLICT');
  const records=state.chainReceipts??[],existing=records.find(r=>r.id===record.id);
  if(existing&&(existing.webTaskId!==record.webTaskId||existing.agentId!==record.agentId||canonical({...existing.evidence,confirmations:0})!==canonical({...record.evidence,confirmations:0})))throw new DomainError('Stored chain receipt conflicts with this claim.','CONFLICT');
  if(current.usedAt&&existing)return state;
  return {...state,chainReceipts:[...records.filter(r=>r.id!==record.id),record],chainChallenges:state.chainChallenges?.map(c=>c.nonce===challenge.nonce?{...c,usedAt:now}:c)};
}
