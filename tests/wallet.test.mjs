import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient,createWalletClient,custom,keccak256,parseAbi,stringToHex } from 'viem';
import { AgentWalletSession,deliveryBytes,walletDeployment } from '../sdk/wallet.ts';
import { encodeSettlementReport } from '../sdk/chain.ts';
import { specHash,verifyDelivery } from '../cre/workflow/verify.ts';
import { seed,transition } from '../lib/agentos/engine.ts';
import { compile } from '../scripts/compile-contracts.mjs';
import { startLocalChain } from '../scripts/local-chain.mjs';

test('wallet session funds, reads and verifies real escrow and rejects network/account changes',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null});
 const [buyer,seller,forwarder,other]=await wallet.getAddresses(),contracts=compile();
 async function deploy(name,args=[]){return(await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],account:buyer,args,gas:6000000n})})).contractAddress;}
 async function write(address,abi,functionName,args=[],account=buyer){const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});await client.waitForTransactionReceipt({hash});return hash;}
 try{
  const token=await deploy('MockToken'),metadata=stringToHex('wallet-test'),metadataHash=keccak256(metadata),escrow=await deploy('AgentEscrow',[token,forwarder,metadataHash]),deployment={mode:'local',chainId:31337,seller,token,escrow,forwarder,metadataHash,deployedBlock:'0',confirmations:1};
  await write(token,contracts.MockToken.abi,'mint',[buyer,10000000n]);
  let chainOverride,accountOverride;
  const sessionProvider={request:args=>args.method==='eth_chainId'&&chainOverride?Promise.resolve(chainOverride):args.method==='eth_accounts'&&accountOverride?Promise.resolve(accountOverride):provider.request(args)};
  const session=await AgentWalletSession.connect(sessionProvider,deployment,false);assert.equal((await session.balances()).token,'10000000');
  let state=await transition(seed(),{type:'create_task',taskId:'wallet',requestId:'wallet',agentId:'atlas',title:'Wallet',budget:1000,scenario:'success'});
  await assert.rejects(session.fund(state.tasks[0],{}),/completed/);
  for(let expectedStep=0;expectedStep<6;expectedStep++)state=await transition(state,{type:'advance',taskId:'wallet',expectedStep});
  const task=state.tasks[0],bytes=deliveryBytes(task,buyer),spec={datasetUrl:'https://evidence.example/dataset',artifactUrl:'https://artifact.example/result',datasetHash:bytes.datasetHash,verification:bytes.verification};
  chainOverride='0x1';await assert.rejects(session.fund(task,spec),/network changed/);chainOverride=undefined;
  accountOverride=[other];await assert.rejects(session.fund(task,spec),/account changed/);accountOverride=undefined;
  const proof=await session.fund(task,spec);assert.equal(proof.status,'funded');assert.equal((await session.task(task,spec)).status,'funded');assert.equal((await session.balances()).token,'7600000');
  await assert.rejects(session.fund(task,spec),/already exists/);await assert.rejects(session.refund(task),/deadline/);
  await assert.rejects(session.task(task,{...spec,artifactUrl:'https://different.example/result'}),/differs/);
  const verdict=verifyDelivery(bytes.datasetText,bytes.artifactText,bytes.id,spec);
  const tx=await write(escrow,parseAbi(['function onReport(bytes,bytes)']),'onReport',[metadata,encodeSettlementReport(bytes.id,specHash(spec),verdict.outputHash,verdict.accepted)],forwarder);
  assert.equal((await session.evidence(task,tx,'settlement',spec)).status,'paid');assert.equal((await session.task(task,spec)).status,'paid');
  await assert.rejects(session.refund(task),/No funded/);
  for(const patch of [{chainId:1},{seller:'0x'+'0'.repeat(40)},{mode:'testnet'},{confirmations:0},{token:undefined}])assert.throws(()=>walletDeployment({...deployment,...patch}));
 }finally{await provider.disconnect();}
});

test('Vault-only local wallet rejects unknown targets when optional identity registries are absent',async()=>{
 const local=await startLocalChain({port:0,identity:false});
 try{
  const response=await fetch(local.base+'/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendTransaction',params:[{from:local.buyer,to:'0x0000000000000000000000000000000000000001',data:'0x'}]})});
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.error.code,-32602);assert.match(data.error.message,/role-specific/);
 }finally{await local.close();}
});
