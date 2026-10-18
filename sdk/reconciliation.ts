import type { ChainEvidence } from './chain.ts';
import { AgentWalletSession } from './wallet.ts';
import { canonical, type DeliverySpec } from '../cre/workflow/verify.ts';
import { matchingDeployment, type ChainChallenge, type ChainClaim, type SavedChainReceipt } from '../lib/agentos/chain-reconciliation.ts';

export async function reconcileReceipt(session:AgentWalletSession,taskId:string,evidence:ChainEvidence,spec:DeliverySpec,options:{baseURL?:string;headers?:Record<string,string>}={}) {
  async function post<T>(body:unknown):Promise<T>{
    const response=await fetch((options.baseURL??'')+'/api/chain',{method:'POST',headers:{'Content-Type':'application/json',...options.headers},credentials:'include',body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error??'Server chain reconciliation failed.');return data;
  }
  const claim:ChainClaim={taskId,buyer:session.account,chainId:session.deployment.chainId,escrow:session.deployment.escrow,transactionHash:evidence.transactionHash,phase:evidence.phase,spec};
  const {challenge}=await post<{challenge:ChainChallenge}>({action:'challenge',claim});
  if(!matchingDeployment(challenge.deployment,session.deployment)||canonical(challenge.claim)!==canonical(claim)||!challenge.message.includes(`Transaction: ${claim.transactionHash}`)||!challenge.message.includes(`Nonce: ${challenge.nonce}`)||Date.parse(challenge.expiresAt)<=Date.now())throw new Error('Server challenge differs from the selected wallet receipt.');
  const signature=await session.signReconciliation(challenge.message);
  return (await post<{record:SavedChainReceipt}>({action:'reconcile',nonce:challenge.nonce,signature})).record;
}
