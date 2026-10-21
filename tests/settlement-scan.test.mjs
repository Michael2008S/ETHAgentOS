import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,encodePacked,keccak256,stringToHex,toHex} from 'viem';
import {scanSettledTask} from '../sdk/settlements.ts';
import {compile} from '../scripts/compile-contracts.mjs';
import {creWorkflowName,creIdentityHash} from '../sdk/cre-receiver.ts';
import {AgentWalletSession,inputEvidence} from '../sdk/wallet.ts';
import {escrowABI,encodeSettlementReport} from '../sdk/chain.ts';
import {orderChain} from '../lib/agentos/order-chain.ts';
import {runOrder} from '../lib/agentos/order-runner.ts';
import {seed} from '../lib/agentos/engine.ts';
import {createOrder,findOrder,authorizeOrder,activateOrder,orderArtifact} from '../lib/agentos/orders.ts';
import {resultHash,specHash} from '../cre/workflow/verify.ts';
import {workItems} from '../lib/agentos/queue.ts';
const id='0x'+'11'.repeat(32),escrow='0x'+'22'.repeat(20),blockHash=n=>'0x'+Number(n).toString(16).padStart(64,'0');
test('settlement discovery is bounded, confirmed, resumable and rejects conflicting or unstable log windows',async()=>{
 const ranges=[],fake={getBlockNumber:async()=>20n,getBlock:async({blockNumber})=>({hash:blockHash(blockNumber)}),getContractEvents:async query=>{ranges.push([query.fromBlock,query.toBlock]);return [];}};
 const input={escrow,taskId:id,fundingBlock:'2',confirmations:3};
 const first=await scanSettledTask(fake,input,{blockSpan:3,windows:2});assert.deepEqual(ranges,[[2n,4n],[5n,7n]]);assert.equal(first.cursor.nextBlock,'8');
 ranges.length=0;const second=await scanSettledTask(fake,{...input,cursor:first.cursor},{blockSpan:2000,windows:1});assert.deepEqual(ranges,[[8n,18n]]);assert.equal(second.cursor.nextBlock,'19');
 ranges.length=0;await scanSettledTask(fake,{...input,cursor:second.cursor});assert.equal(ranges.length,0,'do not scan unconfirmed blocks');
 await assert.rejects(scanSettledTask(fake,{...input,cursor:{...first.cursor,nextBlock:'9'}}),/persisted/);
 await assert.rejects(scanSettledTask(fake,input,{windows:5}),/bounds/);
 const conflicting={...fake,getContractEvents:async()=>[{transactionHash:id},{transactionHash:id}]};await assert.rejects(scanSettledTask(conflicting,input),/Conflicting/);
 let count=0;const unstable={...fake,getBlock:async()=>({hash:blockHash(++count)})};await assert.rejects(scanSettledTask(unstable,input),/changed canonical/);
 const rewind={...fake,getBlock:async({blockNumber})=>({hash:blockHash(blockNumber===7n?77n:blockNumber)})};ranges.length=0;await scanSettledTask(rewind,{...input,cursor:first.cursor},{blockSpan:3,windows:1});assert.deepEqual(ranges,[[2n,4n]],'a changed anchor cannot skip a replacement canonical event');
});

test('public-runtime acknowledgement waits for finalized payment and persists a non-failing deferred queue checkpoint',async()=>{
 // Private in-memory test chain with the Sepolia chain ID; this is not a public RPC or DON.
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:11155111}});let finalizedBlock=0n;
 const proxy={request:({method,params})=>provider.request({method,params:method==='eth_getBlockByNumber'&&params?.[0]==='finalized'?[toHex(finalizedBlock),false]:params})},client=createPublicClient({transport:custom(proxy),cacheTime:0}),signer=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller]=await signer.getAddresses(),contracts=compile();
 const write=async(address,abi,functionName,args=[])=>{const hash=await signer.writeContract({address,abi,functionName,args,account:buyer,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;};
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await signer.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;
 try{
  const token=await deploy('MockToken'),forwarder=await deploy('MockCREForwarder'),workflowName=creWorkflowName('finality-test'),workflowId=resultHash('synthetic-workflow'),escrow=await deploy('AgentEscrowReceiver',[token,forwarder,buyer,workflowName]),deployment={mode:'testnet',chainId:11155111,token,forwarder,escrow,metadataHash:creIdentityHash(workflowName,buyer),confirmations:1,seller,deployedBlock:'0',receiver:{format:'cre-v1',workflowId,workflowName,workflowOwner:buyer}};
  await write(escrow,contracts.AgentEscrowReceiver.abi,'bindWorkflow',[workflowId]);await write(token,contracts.MockToken.abi,'mint',[buyer,10000000n]);const wallet=await AgentWalletSession.connect(provider,deployment,false);let state=seed(),acks=0;
  const store={read:async()=>({state:structuredClone(state)}),updateWorkspace:async(_,reduce)=>{state=await reduce(state);return {state:structuredClone(state)};}},access=orderChain(client,deployment,undefined,async()=>{},async()=>{acks++;});
  const requestId=crypto.randomUUID(),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'a',to:'b',cents:123}]},bytes=inputEvidence({id:'chain-'+requestId,input,skill:'event-analysis'},buyer),spec={datasetUrl:'https://evidence.example/data',artifactUrl:'https://evidence.example/artifact',datasetHash:bytes.datasetHash,verification:bytes.verification};
  state=await createOrder(state,{requestId,title:'Finality cleanup test',agentId:'atlas',buyer,budget:500,input,spec,scenario:'success',timeoutSeconds:300},deployment);let order=state.chainOrders[0];const funded=await wallet.fundOrder(order,3600);state=(await authorizeOrder(state,order.id,'owner',funded.transactionHash,crypto.randomUUID())).state;state=activateOrder(state,order.id,findOrder(state,order.id).authorization.nonce,await access.funding(findOrder(state,order.id),funded.transactionHash));await runOrder(store,'owner',order.id,access);
  order=findOrder(state,order.id);const metadata=encodePacked(['bytes32','bytes10','address','bytes2'],[workflowId,workflowName,buyer,'0x1234']),outputHash=resultHash(JSON.parse(orderArtifact(order,bytes.id)));await write(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata,encodeSettlementReport(bytes.id,specHash(spec),outputHash,true)]);
  assert.equal((await runOrder(store,'owner',order.id,access)).status,'awaiting-finality');order=findOrder(state,order.id);assert.equal(order.status,'completed');assert.equal(order.evidencePendingAck,true);assert.equal(acks,0);assert.ok(workItems(state).find(j=>j.taskId===order.id).notBefore>Date.now());
  assert.equal((await runOrder(store,'owner',order.id,access)).status,'awaiting-finality');assert.equal(acks,0);finalizedBlock=BigInt(order.settlement.blockNumber);const after=new Date(Date.parse(order.evidenceAckAfter)+1).toISOString();
  await runOrder(store,'owner',order.id,access,{now:()=>after});assert.equal(acks,1);assert.equal(findOrder(state,order.id).evidencePendingAck,undefined);assert.equal(workItems(state).some(j=>j.taskId===order.id),false);assert.equal(findOrder(state,order.id).settlement.outputHash,outputHash);
 }finally{await provider.disconnect();}
});

test('runtime discovers external payment and refund without a pasted hash and recovers a reorged scan anchor',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),signer=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller,workflowOwner]=await signer.getAddresses(),contracts=compile();
 const write=async(address,abi,functionName,args=[],account=buyer)=>{const hash=await signer.writeContract({address,abi,functionName,args,account,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;};
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await signer.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;
 try{
  const token=await deploy('MockToken'),forwarder=await deploy('MockCREForwarder'),workflowName=creWorkflowName('public-order-reconciliation'),workflowId=keccak256(stringToHex('workflow-fixture')),escrow=await deploy('AgentEscrowReceiver',[token,forwarder,workflowOwner,workflowName]),deployment={mode:'local',chainId:31337,token,forwarder,escrow,metadataHash:creIdentityHash(workflowName,workflowOwner),confirmations:1,seller,deployedBlock:'0',receiver:{format:'cre-v1',workflowId,workflowName,workflowOwner}};
  await write(escrow,contracts.AgentEscrowReceiver.abi,'bindWorkflow',[workflowId]);await write(token,contracts.MockToken.abi,'mint',[buyer,100000000n]);
  const publications=new Map();let losePublication=true;
  const wallet=await AgentWalletSession.connect(provider,deployment,false),access=orderChain(client,deployment,undefined,async(id,spec,text)=>{if(publications.has(id))assert.equal(publications.get(id),text);publications.set(id,text);if(losePublication){losePublication=false;throw new Error('Lost evidence publication response.');}});let state=seed();const ledger=structuredClone(state.ledger);
  const store={read:async()=>({state:JSON.parse(JSON.stringify(state))}),updateWorkspace:async(_,reduce)=>{state=await reduce(state);return {state:JSON.parse(JSON.stringify(state))};}};
  async function create(){const requestId=crypto.randomUUID(),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'a',to:'b',cents:123}]},bytes=inputEvidence({id:'chain-'+requestId,input,skill:'event-analysis'},buyer),spec={datasetUrl:'https://evidence.example/'+bytes.id,artifactUrl:'https://evidence.example/'+bytes.id+'/artifact',datasetHash:bytes.datasetHash,verification:bytes.verification};state=await createOrder(state,{requestId,title:'Externally settled order',agentId:'atlas',buyer,budget:500,input,spec,scenario:'success',timeoutSeconds:300},deployment);const order=state.chainOrders[0],funding=await wallet.fundOrder(order,120);state=(await authorizeOrder(state,order.id,'owner',funding.transactionHash,crypto.randomUUID())).state;state=activateOrder(state,order.id,findOrder(state,order.id).authorization.nonce,await access.funding(findOrder(state,order.id),funding.transactionHash));return order.id;}
  const first=await create();assert.equal(publications.size,0);assert.equal((await runOrder(store,'owner',first,access)).status,'awaiting-settlement');let ready=findOrder(state,first);assert.ok(ready.settlementAuthorization);assert.equal(publications.get(inputEvidence(ready,buyer).id),ready.settlementAuthorization.artifactText,'publication retries reuse the exact committed artifact');assert.ok(ready.settlementScan);assert.equal(ready.settlement,null);assert.equal((await access.inspect(ready)).status,1,'read-only reconciliation cannot manufacture a report');
  const snapshot=await provider.request({method:'evm_snapshot',params:[]});for(let i=0;i<6;i++)await provider.request({method:'evm_mine',params:[]});await runOrder(store,'owner',first,access);const orphanCursor=findOrder(state,first).settlementScan;assert.ok(BigInt(orphanCursor.anchorBlock)>BigInt(ready.settlementScan.anchorBlock));
  assert.equal(await provider.request({method:'evm_revert',params:[snapshot]}),true);ready=findOrder(state,first);const taskId=inputEvidence(ready,buyer).id,metadata=encodePacked(['bytes32','bytes10','address','bytes2'],[workflowId,workflowName,workflowOwner,'0x1234']),outputHash=resultHash(JSON.parse(orderArtifact(ready,taskId)));
  const transactionHash=await write(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata,encodeSettlementReport(taskId,specHash(ready.spec),outputHash,true)]);
  assert.ok((await client.getBlock()).number<BigInt(orphanCursor.anchorBlock));await runOrder(store,'owner',first,access);let done=findOrder(state,first);assert.equal(done.status,'completed');assert.equal(done.settlement.transactionHash,transactionHash);assert.equal(done.settlement.outputHash,outputHash);
  await runOrder(store,'owner',first,access);assert.equal(state.chainReceipts.filter(r=>r.webTaskId===first).length,1);
  // Exercise a persisted public-runtime cleanup checkpoint on this actual local EVM.
  let offline=true,acks=0;const archiver=orderChain(client,deployment,undefined,undefined,async(id,spec)=>{acks++;assert.equal(id,taskId);assert.equal(specHash(spec),specHash(done.spec));if(offline)throw new Error('Evidence acknowledgement unavailable.');});
  findOrder(state,first).evidencePendingAck=true;assert.ok(workItems(state).some(j=>j.taskId===first));assert.equal((await runOrder(store,'owner',first,archiver)).status,'retryable');assert.equal(findOrder(state,first).settlement.transactionHash,transactionHash);assert.equal(findOrder(state,first).evidencePendingAck,true);
  state=JSON.parse(JSON.stringify(state));offline=false;await runOrder(store,'owner',first,archiver);assert.equal(findOrder(state,first).evidencePendingAck,undefined);assert.equal(workItems(state).some(j=>j.taskId===first),false);assert.equal(acks,4);
  const second=await create();await runOrder(store,'owner',second,access);await provider.request({method:'evm_increaseTime',params:[121]});await provider.request({method:'evm_mine',params:[]});await runOrder(store,'owner',second,access);ready=findOrder(state,second);assert.equal(ready.settlement,null);
  const refundHash=await write(escrow,escrowABI,'refundExpired',[inputEvidence(ready,buyer).id],workflowOwner);await runOrder(store,'owner',second,access);done=findOrder(state,second);assert.equal(done.status,'refunded');assert.equal(done.settlement.transactionHash,refundHash);assert.deepEqual(state.ledger,ledger);
 }finally{await provider.disconnect();}
});
