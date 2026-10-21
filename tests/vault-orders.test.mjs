import test from 'node:test';import assert from 'node:assert/strict';
import ganache from 'ganache';import {createPublicClient,createWalletClient,custom,keccak256,stringToHex} from 'viem';import {privateKeyToAccount} from 'viem/accounts';
import {compile} from '../scripts/compile-contracts.mjs';import {seed} from '../lib/agentos/engine.ts';
import {createOrder,findOrder} from '../lib/agentos/orders.ts';import {orderChain} from '../lib/agentos/order-chain.ts';import {runOrder} from '../lib/agentos/order-runner.ts';
import {inputEvidence} from '../sdk/wallet.ts';import {escrowABI,encodeSettlementReport} from '../sdk/chain.ts';import {specHash,verifyDelivery} from '../cre/workflow/verify.ts';
import {prepareVaultSession,checkVaultBinding,vaultABI} from '../lib/agentos/vault.ts';import {vaultFunder} from '../lib/agentos/vault-executor.ts';

test('one signed Vault session funds two purchases, refunds to Vault, caps total and recovers a mined transfer after lost response',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller,forwarder,executor]=await wallet.getAddresses(),contracts=compile();
 const write=async(address,abi,functionName,args=[],account=buyer)=>{const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return hash;};
 const deploy=async(name,args=[])=> (await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;
 try{
  const token=await deploy('MockToken'),metadata=stringToHex('vault-runtime-test'),escrow=await deploy('AgentEscrow',[token,forwarder,keccak256(metadata)]),vault=await deploy('AgentVault',[escrow]),deployment={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash:keccak256(metadata),confirmations:1,seller,vault,vaultExecutor:executor,deployedBlock:'0'};
  await write(token,contracts.MockToken.abi,'mint',[vault,20000000n]);await write(vault,vaultABI,'allowSeller',[seller,true]);const expires=(await client.getBlock()).timestamp+3600n;await write(vault,vaultABI,'grant',[executor,3000000n,10000000n,expires]);
  let state=seed(),writes=Promise.resolve(),lost=true,fundCalls=0,signatures=0;const store={read:async()=>({state:structuredClone(state)}),updateWorkspace:(_,reduce)=>{const run=writes.then(async()=>{state=await reduce(state);return {state:structuredClone(state)};});writes=run.catch(()=>{});return run;}};
  const account=privateKeyToAccount(provider.getInitialAccounts()[buyer.toLowerCase()].secretKey),session=await prepareVaultSession(state,'owner',deployment,client,{buyer,perTaskCents:300,totalCents:720,dailyCents:1000},crypto.randomUUID());
  assert.equal(session.totalCents,720);assert.equal(session.dailyCents,1000);
  session.signature=await account.signMessage({message:session.message});signatures++;assert.equal(await client.verifyMessage({address:buyer,message:session.message,signature:session.signature}),true);state.vaultSessions=[session];
  const records=new Map(),artifacts=new Map(),settlements=new Map();
  const access=orderChain(client,deployment,async(path,body)=>{
   if(path==='/artifacts'){artifacts.set(body.id,body.artifactText);return {};}
   if(!settlements.has(body.id))settlements.set(body.id,(async()=>{const record=records.get(body.id),verdict=verifyDelivery(record.datasetText,artifacts.get(body.id),body.id,record.spec);return {hash:await write(escrow,contracts.AgentEscrow.abi,'onReport',[metadata,encodeSettlementReport(body.id,specHash(record.spec),verdict.outputHash,verdict.accepted)],forwarder)};})());return settlements.get(body.id);
  });
  const fund=vaultFunder(client,deployment,async(order,data)=>{fundCalls++;const hash=await wallet.sendTransaction({account:executor,to:vault,data,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');if(lost){lost=false;throw new Error('Lost response after mined Vault funding.');}return hash;});
  const create=async(scenario='success')=>{const requestId=crypto.randomUUID(),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'a',to:'b',cents:123}]},bytes=inputEvidence({id:'chain-'+requestId,input,skill:'event-analysis'},buyer),spec={datasetUrl:'https://a.example/'+bytes.id,artifactUrl:'https://b.example/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification};records.set(bytes.id,{datasetText:bytes.datasetText,spec});state=await createOrder(state,{requestId,vaultSessionId:session.sessionId,title:'Vault purchase',agentId:'atlas',buyer,budget:300,input,spec,scenario,timeoutSeconds:300},deployment);return state.chainOrders[0];};
  for(const scenario of ['success','success','invalid-delivery']){
   const order=await create(scenario);await Promise.all(Array.from({length:3},()=>runOrder(store,'owner',order.id,access,{vaultFunder:fund})));
   const done=findOrder(state,order.id);assert.ok(done.settlement,JSON.stringify({status:done.status,failure:done.failure,lastError:done.lastError,events:done.events}));assert.equal(done.settlement.status,scenario==='invalid-delivery'?'refunded':'paid');assert.equal(done.funding.buyer.toLowerCase(),vault.toLowerCase());assert.equal(done.vault.owner.toLowerCase(),buyer.toLowerCase());
   const opened=await client.getContractEvents({address:escrow,abi:escrowABI,eventName:'Opened',args:{id:inputEvidence(done,buyer).id},fromBlock:0n});assert.equal(opened.length,1);
  }
  assert.equal(fundCalls,3);assert.equal(signatures,1);assert.equal((await client.readContract({address:token,abi:contracts.MockToken.abi,functionName:'balanceOf',args:[vault]})),15200000n);
  assert.equal(await client.readContract({address:vault,abi:vaultABI,functionName:'spent',args:[executor,(await client.getBlock()).timestamp/86400n]}),7200000n);
  await assert.rejects(create(),/total allowance/);
  await write(vault,vaultABI,'revoke',[executor]);await assert.rejects(checkVaultBinding(client,deployment,session),/revoked/);
  await write(vault,vaultABI,'grant',[executor,3000000n,10000000n,expires]);await assert.rejects(checkVaultBinding(client,deployment,session),/revoked/);
  assert.equal(await client.readContract({address:vault,abi:vaultABI,functionName:'spent',args:[executor,(await client.getBlock()).timestamp/86400n]}),7200000n,'re-granting cannot reset daily spending');
 }finally{await provider.disconnect();}
});
