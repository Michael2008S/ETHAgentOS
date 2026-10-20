import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient,createWalletClient,custom,keccak256,parseAbi,stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compile } from '../scripts/compile-contracts.mjs';
import { AgentWalletSession,deliveryBytes } from '../sdk/wallet.ts';
import { encodeSettlementReport } from '../sdk/chain.ts';
import { createChainChallenge,verifyChainClaim,saveChainReceipt } from '../lib/agentos/chain-reconciliation.ts';
import { seed,transition } from '../lib/agentos/engine.ts';
import { specHash,verifyDelivery } from '../cre/workflow/verify.ts';

test('server reconciliation verifies EVM evidence, binds wallet/workspace and saves one immutable receipt',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null});
 const [buyer,seller,forwarder,other]=await wallet.getAddresses(),contracts=compile();
 const account=privateKeyToAccount(provider.getInitialAccounts()[buyer.toLowerCase()].secretKey),wrongAccount=privateKeyToAccount(provider.getInitialAccounts()[other.toLowerCase()].secretKey);
 async function deploy(name,args=[]){return(await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],account:buyer,args,gas:6000000n})})).contractAddress;}
 async function write(address,abi,functionName,args=[],from=buyer){const hash=await wallet.writeContract({address,abi,functionName,args,account:from,gas:6000000n});await client.waitForTransactionReceipt({hash});return hash;}
 try{
  const token=await deploy('MockToken'),metadata=stringToHex('reconciliation-test'),metadataHash=keccak256(metadata),escrow=await deploy('AgentEscrow',[token,forwarder,metadataHash]),deployment={mode:'local',chainId:31337,seller,token,escrow,forwarder,metadataHash,deployedBlock:'0',confirmations:1};
  await write(token,contracts.MockToken.abi,'mint',[buyer,100000000n]);
  const session=await AgentWalletSession.connect(provider,deployment,false);
  let state=seed();
  async function completed(id){state=await transition(state,{type:'create_task',taskId:id,requestId:id,agentId:'atlas',title:id,budget:1000,scenario:'success'});for(let expectedStep=0;expectedStep<6;expectedStep++)state=await transition(state,{type:'advance',taskId:id,expectedStep});return state.tasks.find(t=>t.id===id);}
  const task=await completed('reconcile'),bytes=deliveryBytes(task,buyer),spec={datasetUrl:'https://public.example/data',artifactUrl:'https://public.example/result',datasetHash:bytes.datasetHash,verification:bytes.verification};
  const funding=await session.fund(task,spec),claim={taskId:task.id,buyer,chainId:31337,escrow,transactionHash:funding.transactionHash,phase:'funding',spec};
  let issued=await createChainChallenge(state,'owner-a',claim,deployment,crypto.randomUUID());state=issued.state;
  const signature=await account.signMessage({message:issued.challenge.message});
  const verified=await verifyChainClaim(state,issued.challenge.nonce,signature,deployment,client);
  const ledger=structuredClone(state.ledger);state=await saveChainReceipt(state,verified.challenge,verified.record);assert.equal(state.chainReceipts.length,1);assert.deepEqual(state.ledger,ledger);
  assert.strictEqual(await saveChainReceipt(state,verified.challenge,verified.record),state);
  const cross=await createChainChallenge(state,'owner-b',claim,deployment,crypto.randomUUID());
  await assert.rejects(verifyChainClaim(cross.state,cross.challenge.nonce,signature,deployment,client),/signature/);
  await assert.rejects(verifyChainClaim(state,issued.challenge.nonce,await wrongAccount.signMessage({message:issued.challenge.message}),deployment,client),/signature/);
  await assert.rejects(verifyChainClaim(state,issued.challenge.nonce,signature,deployment,client, new Date(Date.parse(issued.challenge.expiresAt)+1).toISOString()),/expired/);
  await assert.rejects(verifyChainClaim(state,issued.challenge.nonce,signature,{...deployment,seller:other},client),/deployment changed/);
  await assert.rejects(createChainChallenge(state,'owner-a',{...claim,escrow:other},deployment,crypto.randomUUID()),/not enabled/);
  const verdict=verifyDelivery(bytes.datasetText,bytes.artifactText,bytes.id,spec);
  const tx=await write(escrow,parseAbi(['function onReport(bytes,bytes)']),'onReport',[metadata,encodeSettlementReport(bytes.id,specHash(spec),verdict.outputHash,true)],forwarder);
  issued=await createChainChallenge(state,'owner-a',{...claim,transactionHash:tx,phase:'settlement'},deployment,crypto.randomUUID());state=issued.state;
  const settled=await verifyChainClaim(state,issued.challenge.nonce,await account.signMessage({message:issued.challenge.message}),deployment,client);assert.equal(settled.record.evidence.status,'paid');
  state=await saveChainReceipt(state,settled.challenge,settled.record);assert.equal(state.chainReceipts.length,2);assert.deepEqual(state.ledger,ledger);
  const changedSpec=await createChainChallenge(state,'owner-a',{...claim,transactionHash:tx,phase:'settlement',spec:{...spec,artifactUrl:'https://different.example/result'}},deployment,crypto.randomUUID());
  await assert.rejects(verifyChainClaim(changedSpec.state,changedSpec.challenge.nonce,await account.signMessage({message:changedSpec.challenge.message}),deployment,client),/committed intent/);
  const second=await completed('other-task'),secondBytes=deliveryBytes(second,buyer),secondSpec={...spec,datasetHash:secondBytes.datasetHash};
  await session.fund(second,secondSpec);
  const wrongTransaction=await createChainChallenge(state,'owner-a',{...claim,taskId:second.id,transactionHash:tx,phase:'settlement',spec:secondSpec},deployment,crypto.randomUUID());
  await assert.rejects(verifyChainClaim(wrongTransaction.state,wrongTransaction.challenge.nonce,await account.signMessage({message:wrongTransaction.challenge.message}),deployment,client),/committed intent/);
  const badTx=await write(escrow,parseAbi(['function onReport(bytes,bytes)']),'onReport',[metadata,encodeSettlementReport(secondBytes.id,specHash(secondSpec),'0x'+'12'.repeat(32),true)],forwarder);
  const badOutput=await createChainChallenge(state,'owner-a',{...claim,taskId:second.id,transactionHash:badTx,phase:'settlement',spec:secondSpec},deployment,crypto.randomUUID());
  await assert.rejects(verifyChainClaim(badOutput.state,badOutput.challenge.nonce,await account.signMessage({message:badOutput.challenge.message}),deployment,client),/Paid output differs/);
  const tampered=structuredClone(state);tampered.tasks.find(t=>t.id===task.id).output.totalCents++;
  await assert.rejects(verifyChainClaim(tampered,issued.challenge.nonce,signature,deployment,client),/matching valid receipt/);
 }finally{await provider.disconnect();}
});

test('server chain configuration has no production loopback fallback and rejects credential URLs',async()=>{
 const {serverChain}=await import('../lib/agentos/chain-config.ts');
 for(const origin of ['https://agentos.example','http://127.0.0.1:5177'])await assert.rejects(serverChain(new Request(origin)),error=>error.code==='UNAVAILABLE');
 const deployment={mode:'testnet',chainId:11155111,escrow:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20),forwarder:'0x'+'33'.repeat(20),seller:'0x'+'44'.repeat(20),metadataHash:'0x'+'55'.repeat(32),confirmations:2,deployedBlock:'123'};
 for(const rpcUrl of ['http://127.0.0.1:8545','https://user:secret@rpc.example','https://rpc.example/#secret'])await assert.rejects(serverChain(new Request('https://agentos.example'),JSON.stringify({rpcUrl,deployment})),/HTTPS endpoint/);
 const resolved=await serverChain(new Request('https://agentos.example'),JSON.stringify({rpcUrl:'https://rpc.example',deployment}));assert.equal(resolved.deployment.chainId,11155111);
 await assert.rejects(serverChain(new Request('https://agentos.example'),JSON.stringify({rpcUrl:'https://rpc.example',deployment:{...deployment,mode:'local',chainId:31337}})),/wrong network mode/);
});
