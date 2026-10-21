import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,encodePacked,keccak256,stringToHex} from 'viem';
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
  const second=await create();await runOrder(store,'owner',second,access);await provider.request({method:'evm_increaseTime',params:[121]});await provider.request({method:'evm_mine',params:[]});await runOrder(store,'owner',second,access);ready=findOrder(state,second);assert.equal(ready.settlement,null);
  const refundHash=await write(escrow,escrowABI,'refundExpired',[inputEvidence(ready,buyer).id],workflowOwner);await runOrder(store,'owner',second,access);done=findOrder(state,second);assert.equal(done.status,'refunded');assert.equal(done.settlement.transactionHash,refundHash);assert.deepEqual(state.ledger,ledger);
 }finally{await provider.disconnect();}
});
