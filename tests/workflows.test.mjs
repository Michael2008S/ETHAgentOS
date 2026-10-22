import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {compile} from '../scripts/compile-contracts.mjs';
import {seed,normalizeInput} from '../lib/agentos/engine.ts';
import {findOrder,createOrder,orderPolicy} from '../lib/agentos/orders.ts';
import {createWorkflow,advanceWorkflow,findWorkflow,controlWorkflow} from '../lib/agentos/workflows.ts';
import {runWorkflow} from '../lib/agentos/workflow-runner.ts';
import {runOrder} from '../lib/agentos/order-runner.ts';
import {orderChain} from '../lib/agentos/order-chain.ts';
import {acceptedArtifact,acceptedArtifactInput,memoryParent,verifyMemoryAuthority,acceptedOrderMemories} from '../lib/agentos/artifact-memory.ts';
import {inputEvidence} from '../sdk/wallet.ts';
import {escrowABI,encodeSettlementReport} from '../sdk/chain.ts';
import {specHash,verifyDelivery,resultHash,acceptedMemoryRecords} from '../cre/workflow/verify.ts';
import {prepareVaultSession,vaultABI,vaultAllowance} from '../lib/agentos/vault.ts';
import {vaultFunder} from '../lib/agentos/vault-executor.ts';
import {commitWithJobs,claimJob,acknowledgeJob,workItems} from '../lib/agentos/queue.ts';

test('two paid steps consume accepted allocations and recover a crashed D1 workflow without duplicate purchase',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller,forwarder,executor]=await wallet.getAddresses(),contracts=compile();
 const write=async(address,abi,functionName,args=[],account=buyer)=>{const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;};
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;
 const sqlite=new DatabaseSync(':memory:');
 const db={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){return {meta:sqlite.prepare(sql).run(...args)};}};}};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 try{
  for(const name of ['0000_parallel_roland_deschain','0001_chemical_famine'])sqlite.exec(readFileSync('drizzle/'+name+'.sql','utf8'));
  const token=await deploy('MockToken'),metadata=stringToHex('workflow-runtime-test'),escrow=await deploy('AgentEscrow',[token,forwarder,keccak256(metadata)]),vault=await deploy('AgentVault',[escrow]),deployment={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash:keccak256(metadata),confirmations:1,seller,vault,vaultExecutor:executor,deployedBlock:'0'};
  await write(token,contracts.MockToken.abi,'mint',[vault,100000000n]);await write(vault,vaultABI,'allowSeller',[seller,true]);await write(vault,vaultABI,'grant',[executor,5000000n,60000000n,(await client.getBlock()).timestamp+3600n]);
  const initial=seed(),session=await prepareVaultSession(initial,'owner',deployment,client,{buyer,perTaskCents:500,totalCents:600,dailyCents:6000},crypto.randomUUID());
  session.signature=await privateKeyToAccount(provider.getInitialAccounts()[buyer.toLowerCase()].secretKey).signMessage({message:session.message});initial.vaultSessions=[session];
  sqlite.prepare('INSERT INTO agentos_workspaces VALUES (?,0,?)').run('owner',JSON.stringify(initial));
  let writes=Promise.resolve(),loseCommit=false;
  const store={async read(owner){const row=sqlite.prepare('SELECT revision,data FROM agentos_workspaces WHERE owner_id=?').get(owner);return {state:JSON.parse(row.data),revision:row.revision};},updateWorkspace(owner,reduce){const run=writes.then(async()=>{const before=await store.read(owner),next=await reduce(before.state);if(loseCommit&&next.chainOrders?.length===2){loseCommit=false;throw new Error('Crash after immutable publication before D1 commit');}assert.equal(await commitWithJobs(db,owner,before.revision,before.state,next),true);return store.read(owner);});writes=run.catch(()=>{});return run;}};
  const records=new Map(),artifacts=new Map(),settlements=new Map();let fundCalls=0;
  const publish=async bytes=>{const spec={datasetUrl:'https://data.example/'+bytes.id,artifactUrl:'https://artifact.example/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification};if(records.has(bytes.id))assert.deepEqual(records.get(bytes.id),{datasetText:bytes.datasetText,spec});records.set(bytes.id,{datasetText:bytes.datasetText,spec});return spec;};
  const access=orderChain(client,deployment,async(path,body)=>{
   if(path==='/artifacts'){if(artifacts.has(body.id))assert.equal(artifacts.get(body.id),body.artifactText);artifacts.set(body.id,body.artifactText);return {};}
   if(!settlements.has(body.id))settlements.set(body.id,(async()=>{const record=records.get(body.id),verdict=verifyDelivery(record.datasetText,artifacts.get(body.id),body.id,record.spec);return {hash:await write(escrow,contracts.AgentEscrow.abi,'onReport',[metadata,encodeSettlementReport(body.id,specHash(record.spec),verdict.outputHash,verdict.accepted)],forwarder)};})());return settlements.get(body.id);
  });
  const fund=vaultFunder(client,deployment,async(_,data)=>{fundCalls++;const hash=await wallet.sendTransaction({account:executor,to:vault,data,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;});
  const draft={requestId:crypto.randomUUID(),title:'Allocation review',buyer,vaultSessionId:session.sessionId,agentIds:['sage','atlas'],budgets:[400,300],timeoutSeconds:300,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:3,records:[{block:1,from:'treasury',to:'a',cents:123},{block:2,from:'treasury',to:'b',cents:456},{block:3,from:'treasury',to:'a',cents:100}]}};
  await assert.rejects(createWorkflow({...initial,policy:{...initial.policy,allowedSkills:['treasury-report']}},draft,deployment,publish),/authorized treasury service/,'both step permissions must pass before the first purchase');
  await store.updateWorkspace('owner',s=>createWorkflow(s,draft,deployment,publish));let state=(await store.read('owner')).state,w=state.workflows[0];
  assert.equal(state.chainOrders.length,1);assert.equal(workItems(state).filter(j=>j.kind==='workflow').length,1);assert.equal(w.totalBudget,700);
  assert.equal(await createWorkflow(state,draft,deployment,publish),state);await assert.rejects(createWorkflow(state,{...draft,title:'changed'},deployment,publish),/different parameters/);
  assert.throws(()=>vaultAllowance(state,session.sessionId,buyer,'event-analysis',300,240),/total allowance/,'future quote reserves the remaining session allowance');
  const constrained={...state,policy:{...state.policy,dailyBudget:699}};assert.match(orderPolicy(constrained,findOrder(constrained,w.steps[0].orderId),new Date().toISOString()),/daily allowance/);
  assert.throws(()=>acceptedArtifact(state.chainOrders[0]),/completed, paid/);
  await runOrder(store,'owner',w.steps[0].orderId,access,{vaultFunder:fund});state=(await store.read('owner')).state;const first=findOrder(state,w.steps[0].orderId);assert.equal(first.status,'completed');assert.equal(state.workflows[0].steps[1].orderId,undefined);
  // The order worker completed; the workflow consumer died before advancing its dependency.
  assert.equal(sqlite.prepare("SELECT status FROM agentos_runtime_jobs WHERE owner_id=? AND kind='order' AND task_id=?").get('owner',first.id).status,'completed','direct settlement retires its delayed queue row without another claim');
  const job=await claimJob(db,'owner',Date.now(),100);assert.equal(job.kind,'workflow');loseCommit=true;
  await assert.rejects(runWorkflow(store,'owner',w.id,access,publish,{vaultFunder:fund}),/Crash after immutable publication/);
  state=(await store.read('owner')).state;assert.equal(state.chainOrders.length,1);assert.equal(state.workflows[0].steps[1].orderId,undefined);
  const recovered=await claimJob(db,'owner',Date.now()+120001);assert.equal(recovered.kind,'workflow');assert.notEqual(recovered.lease_token,job.lease_token);
  await Promise.all(Array.from({length:4},()=>runWorkflow(store,'owner',w.id,access,publish,{vaultFunder:fund})));
  state=(await store.read('owner')).state;w=findWorkflow(state,w.id);assert.equal(w.status,'completed');assert.equal(state.chainOrders.length,2);assert.equal(fundCalls,2);assert.equal(settlements.size,2);
  assert.equal(await acknowledgeJob(db,job,await store.read('owner')),false);assert.equal(await acknowledgeJob(db,recovered,await store.read('owner')),true);
  const second=findOrder(state,w.steps[1].orderId);assert.equal(second.input.records.length,2);assert.equal(second.output.transferCount,2);assert.equal(second.output.totalCents,679);assert.equal(second.input.memory.orderId,first.id);assert.notDeepEqual(second.input.records,first.input.records);assert.equal(second.spec.verification.memoryHash,resultHash(second.input.memory));assert.equal(acceptedOrderMemories(state).length,2);
  for(const o of state.chainOrders){assert.equal(o.settlement.status,'paid');const logs=await client.getContractEvents({address:escrow,abi:escrowABI,eventName:'Opened',args:{id:inputEvidence(o,buyer).id},fromBlock:0n});assert.equal(logs.length,1);}
  assert.equal(await client.readContract({address:token,abi:contracts.MockToken.abi,functionName:'balanceOf',args:[vault]}),94000000n);assert.deepEqual(state.ledger,initial.ledger);
  const derived=acceptedArtifactInput(first);assert.deepEqual(normalizeInput(derived),derived);
  const changed=structuredClone(derived);changed.records[0].cents++;assert.throws(()=>normalizeInput(changed),/accepted artifact/);
  const wrapper=JSON.parse(inputEvidence(second,buyer).datasetText);wrapper.records[0].cents++;
  const modifiedBytes=JSON.stringify(wrapper),modifiedSpec={...second.spec,datasetHash:keccak256(stringToHex(modifiedBytes))};assert.throws(()=>verifyDelivery(modifiedBytes,JSON.stringify({}),inputEvidence(second,buyer).id,modifiedSpec),/derived records/,'recommitting bytes does not authorize a false projection of accepted memory');
  const forged=structuredClone(derived.memory),artifact=JSON.parse(forged.artifactText);artifact.output.allocations.a++;artifact.outputHash=resultHash(artifact.output);forged.artifactText=JSON.stringify(artifact);forged.artifactHash=resultHash(artifact);assert.throws(()=>acceptedMemoryRecords(forged),/complete acceptance/);
  assert.throws(()=>memoryParent({...state,chainOrders:[second]},second),/workspace/);assert.throws(()=>memoryParent(state,{...second,buyer:seller}),/workspace/);
  const badChain={...access,settlement:async()=>({...first.settlement,status:'refunded'})};await assert.rejects(verifyMemoryAuthority(state,second,badChain),/no longer canonical/);
  const nextState=structuredClone(state);nextState.workflows=[];nextState.vaultSessions[0].totalCents=6000;
  const nextDraft={...draft,requestId:crypto.randomUUID(),title:'Revocation workflow'};
  const created=await createWorkflow(nextState,nextDraft,deployment,publish);let cancelled=controlWorkflow(created,created.workflows[0].id,'cancel');assert.equal(cancelled.workflows[0].status,'cancelled');assert.equal(findOrder(cancelled,cancelled.workflows[0].steps[0].orderId).status,'cancelled');assert.equal(workItems(cancelled).filter(j=>j.kind==='workflow').length,0);
  const quoteChange=structuredClone(state);quoteChange.workflows[0].status='running';delete quoteChange.workflows[0].steps[1].orderId;quoteChange.chainOrders=quoteChange.chainOrders.filter(o=>o.id===first.id);quoteChange.agents.find(a=>a.id==='atlas').price++;
  const blocked=await advanceWorkflow(quoteChange,w.id,access,publish);assert.equal(blocked.workflows[0].status,'blocked');assert.match(blocked.workflows[0].lastError,/quote changed/);assert.equal(blocked.chainOrders.length,1);
 }finally{sqlite.close();await provider.disconnect();}
});
