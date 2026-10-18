import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient,createWalletClient,custom,keccak256,stringToHex,parseAbi } from 'viem';
import { AgentChainClient,centsToToken,chainTaskId,encodeSettlementReport } from '../sdk/chain.ts';
import { verifyDelivery } from '../cre/workflow/verify.ts';
import { compile } from '../scripts/compile-contracts.mjs';

test('chain amount conversion is exact and task identifiers are tenant scoped',()=>{
  assert.equal(centsToToken(240,6),2400000n);assert.equal(centsToToken(100,0),1n);
  for(const [cents,decimals]of [[1,0],[1.1,6],[-1,6],[100,37],[0,6]])assert.throws(()=>centsToToken(cents,decimals));
  assert.notEqual(chainTaskId('owner-a','task'),chainTaskId('owner-b','task'));
  assert.notEqual(chainTaskId('ab','c'),chainTaskId('a','bc'));
});
test('adapter binds funded and settled EVM receipts to parties, task, amount and delivery',async()=>{
  const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}});
  const client=createPublicClient({transport:custom(provider)}),wallet=createWalletClient({transport:custom(provider),chain:null});
  const [buyer,seller,forwarder,other]=await wallet.getAddresses(),artifacts=compile();
  async function send(tx,account=buyer){const hash=await wallet.sendTransaction({...tx,account,gas:6000000n});return client.waitForTransactionReceipt({hash});}
  async function write(address,abi,functionName,args=[],account=buyer){const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});return client.waitForTransactionReceipt({hash});}
  async function deploy(name,args=[]){const hash=await wallet.deployContract({...artifacts[name],account:buyer,args,gas:6000000n});return(await client.waitForTransactionReceipt({hash})).contractAddress;}
  try{
    const token=await deploy('MockToken'),metadata=stringToHex('local-verifier-only'),metadataHash=keccak256(metadata),escrow=await deploy('AgentEscrow',[token,forwarder,metadataHash]);
    const deployment={chainId:31337,token,escrow,forwarder,metadataHash,confirmations:1},adapter=new AgentChainClient(client,deployment);
    await write(token,artifacts.MockToken.abi,'mint',[buyer,10000000n]);
    const dataset='[{"cents":100},{"cents":200}]',spec={datasetUrl:'https://evidence.example/data.json',datasetHash:keccak256(stringToHex(dataset)),artifactUrl:'https://delivery.example/1.json'};
    const input={workspace:'isolated-test',taskId:'web-task',buyer,seller,quoteCents:240,deadline:(await client.getBlock()).timestamp+120n,spec};
    const {intent,transactions}=await adapter.prepareFunding(input);assert.equal(transactions.length,2);
    let funded;for(const tx of transactions){funded=await send(tx);assert.equal(funded.status,'success');}
    assert.equal((await adapter.verifyEvidence(intent,funded.transactionHash,'funding')).amount,'2400000');
    await assert.rejects(adapter.prepareFunding(input),/already exists/);
    await assert.rejects(adapter.verifyEvidence({...intent,seller:other},funded.transactionHash,'funding'),/committed intent/);
    const strict=new AgentChainClient(client,{...deployment,confirmations:10});await assert.rejects(strict.verifyEvidence(intent,funded.transactionHash,'funding'),/confirmed/);
    await assert.rejects(new AgentChainClient(client,{...deployment,chainId:1}).validateDeployment(),/chain/);
    const artifact=JSON.stringify({taskId:intent.id,totalCents:300,transferCount:2}),verdict=verifyDelivery(dataset,artifact,intent.id,spec.datasetHash);
    assert.equal(verdict.accepted,true);
    const data=encodeSettlementReport(intent.id,intent.specHash,verdict.outputHash,verdict.accepted);
    const settled=await write(escrow,parseAbi(['function onReport(bytes metadata,bytes report)']),'onReport',[metadata,data],forwarder);
    const evidence=await adapter.verifyEvidence(intent,settled.transactionHash,'settlement',verdict.outputHash);assert.equal(evidence.status,'paid');
    await assert.rejects(adapter.verifyEvidence(intent,settled.transactionHash,'funding'),/absent/);
    await assert.rejects(adapter.verifyEvidence(intent,settled.transactionHash,'settlement',keccak256(stringToHex('tampered'))),/commitment/);
    assert.equal(await client.readContract({address:token,abi:artifacts.MockToken.abi,functionName:'balanceOf',args:[seller]}),2400000n);
    const replay=await write(escrow,parseAbi(['function onReport(bytes metadata,bytes report)']),'onReport',[metadata,data],forwarder);assert.equal(replay.status,'reverted');
    await assert.rejects(adapter.verifyEvidence(intent,replay.transactionHash,'settlement'),/reverted/);
    // A funding proof refers to its historical block, not a mutable UI label.
    assert.equal((await adapter.verifyEvidence(intent,funded.transactionHash,'funding')).status,'funded');
  }finally{await provider.disconnect();}
});
