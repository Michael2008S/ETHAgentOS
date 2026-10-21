import {verifyOrderQuote} from './supplier-quote.ts';
import {orderSeller} from './order-parties.ts';
import { keccak256,stringToHex,type Hex,type PublicClient } from 'viem';
import { AgentChainClient,centsToToken,escrowABI,type ChainIntent } from '../../sdk/chain.ts';
import { inputEvidence,type WalletDeployment } from '../../sdk/wallet.ts';
import { canonical,specHash } from '../../cre/workflow/verify.ts';
import { matchingDeployment } from './chain-reconciliation.ts';
import { DomainError } from './engine.ts';
import { orderArtifact,type ChainOrder } from './orders.ts';
import {scanSettledTask} from '../../sdk/settlements.ts';
import type {EvidenceService} from './evidence-publisher.ts';

export type LocalOrderCall=(path:string,body:unknown)=>Promise<{hash:Hex}>;
export function orderChain(client:PublicClient,deployment:WalletDeployment,localCall?:LocalOrderCall,publishArtifact?:EvidenceService['publish'],completeEvidence?:EvidenceService['complete']){
  const chain=new AgentChainClient(client,deployment);
  async function inspect(order:ChainOrder){
    if(!matchingDeployment(order.deployment,deployment))throw new DomainError('Order deployment differs from the server configuration.','CONFLICT');
    const {decimals}=await chain.validateDeployment(),bytes=inputEvidence(order,order.buyer);
    const block=await client.getBlock(),task=await client.readContract({address:deployment.escrow,abi:escrowABI,functionName:'tasks',args:[bytes.id],blockNumber:block.number});
    const intent:ChainIntent={id:bytes.id,buyer:order.vault?.vault??order.buyer,seller:orderSeller(order),amount:centsToToken(order.quote,decimals),deadline:task[3],specHash:specHash(order.spec)};
    if(task[5]!==0&&(task[0].toLowerCase()!==intent.buyer.toLowerCase()||task[1].toLowerCase()!==intent.seller.toLowerCase()||task[2]!==intent.amount||task[4]!==intent.specHash))throw new DomainError('Order escrow does not match its frozen commitment.','CONFLICT');
    return {intent,status:task[5],timestamp:block.timestamp,outputHash:task[6]};
  }
  async function verifySettlement(order:ChainOrder,hash:Hex){
    const current=await inspect(order),evidence=await chain.verifyEvidence(current.intent,hash,'settlement');
    if(evidence.status==='paid'&&(!order.output||order.failure||evidence.outputHash!==keccak256(stringToHex(canonical(JSON.parse(orderArtifact(order,current.intent.id)))))))throw new DomainError('Paid escrow does not match an authorized, verified order output.','CONFLICT');
    return evidence;
  }
  return {
    inspect,
    verifySignature:(order:ChainOrder,message:string,signature:Hex)=>client.verifyMessage({address:order.buyer,message,signature}),
    async funding(order:ChainOrder,hash:Hex){const current=await inspect(order);if(![1,3].includes(current.status))throw new DomainError('A funded or refunded escrow is required for confirmation.');const evidence=await chain.verifyEvidence(current.intent,hash,'funding');if(order.supplierQuote)await verifyOrderQuote(order,Number((await client.getBlock({blockNumber:BigInt(evidence.blockNumber)})).timestamp));return {evidence,deadline:current.intent.deadline,chainNow:current.timestamp,currentStatus:current.status};},
    settlement:verifySettlement,
    async refundFinality(order:ChainOrder){
      if(order.settlement?.status!=='refunded')throw new DomainError('A verified refund is required.','CONFLICT');
      const evidence=await verifySettlement(order,order.settlement.transactionHash);
      if(evidence.status!=='refunded')throw new DomainError('Order has not been refunded.','CONFLICT');
      const finalized=await client.getBlock({blockTag:deployment.mode==='testnet'?'finalized':'latest'});
      if(finalized.number<BigInt(evidence.blockNumber))return null;
      const [anchor,receiptBlock]=await Promise.all([client.getBlock({blockNumber:finalized.number}),client.getBlock({blockNumber:BigInt(evidence.blockNumber)})]);
      if(!finalized.hash||anchor.hash!==finalized.hash||receiptBlock.hash!==evidence.blockHash)throw new DomainError('Refund finality anchor changed. Retry canonical verification.','CONFLICT');
      return {evidence,finalizedBlock:finalized.number.toString(),finalizedBlockHash:finalized.hash};
    },
    async completeEvidence(order:ChainOrder){
      if(!completeEvidence)return true;
      if(!order.settlement)throw new DomainError('A verified settlement is required before ready queue acknowledgement.','CONFLICT');
      const evidence=await verifySettlement(order,order.settlement.transactionHash);
      if(deployment.mode==='testnet'&&BigInt(evidence.blockNumber)>(await client.getBlock({blockTag:'finalized'})).number)return false;
      await completeEvidence(inputEvidence(order,order.buyer).id,order.spec);return true;
    },
    async settle(order:ChainOrder){
      const current=await inspect(order);
      if(!localCall){
        if(current.status===1&&current.timestamp<current.intent.deadline&&publishArtifact){if(!order.settlementAuthorization)throw new DomainError('Artifact publication requires a committed settlement intent.','CONFLICT');await publishArtifact(current.intent.id,order.spec,order.settlementAuthorization.artifactText);}
        return null;
      }
      if(current.status===1&&current.timestamp<current.intent.deadline)await localCall('/artifacts',{id:current.intent.id,artifactText:orderArtifact(order,current.intent.id)});
      return (await localCall('/settle',{id:current.intent.id})).hash;
    },
    async scanSettlement(order:ChainOrder){
      if(localCall||!order.funding)return {transactionHash:null,cursor:undefined};
      return scanSettledTask(client,{escrow:deployment.escrow,taskId:inputEvidence(order,order.buyer).id,fundingBlock:order.funding.blockNumber,confirmations:deployment.confirmations,cursor:order.settlementScan});
    },
  };
}
export type OrderChain=Omit<ReturnType<typeof orderChain>,'refundFinality'>&{refundFinality?:ReturnType<typeof orderChain>['refundFinality']};
