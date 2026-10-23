import {fundsEvidence} from '../../lib/agentos/funds-evidence.ts';import {readX402Evidence} from '../../lib/agentos/x402-evidence.ts';
import assert from 'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';
import{startCCIPService}from'./service.mjs';import{x402VaultFixture}from'../../tests/x402-vault-fixture.mjs';import{ccipDraft}from'../../tests/ccip-business-fixture.mjs';import{createCCIPTask,runCCIPTask,ccipJob,ccipTerminal}from'../../lib/agentos/ccip-tasks.ts';import{localCCIPTransport}from'../../lib/agentos/ccip-runtime.ts';import{commitWithJobs}from'../../lib/agentos/queue.ts';import{tokenABI}from'../../sdk/chain.ts';import{authorizationABI}from'../x402/protocol.mjs';import{compile}from'../compile-contracts.mjs';
export async function runCombinedAcceptance(onCheck=()=>{}){
 const root=await mkdtemp(tmpdir()+'/agentos-combined-');let ccip,f,observationDown=false,upstreamHash;const checks=[];
 const pass=name=>{checks.push({name,passed:true});onCheck(name);};
 try{
  ccip=await startCCIPService({root:root+'/ccip',appOrigin:'http://127.0.0.1:12345',faults:{holdKinds:[3]}});
  const feedABI=compile().MockPriceFeed.abi;
  f=await x402VaultFixture({feedOptions:{enabled:true,riskEnabled:true},facilitatorOptions:{afterBroadcast:async row=>{upstreamHash=row.transaction;observationDown=true;await f.write(f.stack.dataFeeds.usdcUsd,feedABI,'setRoundData',[2,90000000n,(await f.client.getBlock()).timestamp,2]);throw Error('Controlled loss of broadcast outcome');}}});
  const originalReceipt=f.client.getTransactionReceipt.bind(f.client);f.client.getTransactionReceipt=args=>{if(observationDown&&args.hash===upstreamHash)throw Error('Controlled canonical receipt observation outage');return originalReceipt(args);};
  f.store.database.batch=async statements=>{f.db.exec('BEGIN IMMEDIATE');try{const result=[];for(const s of statements)result.push(await s.run());f.db.exec('COMMIT');return result;}catch(error){f.db.exec('ROLLBACK');throw error;}};
  const store={read:f.store.read,async updateWorkspace(owner,reduce){for(let i=0;i<12;i++){const {state,revision}=await f.store.read(owner),next=await reduce(structuredClone(state));if(await commitWithJobs(f.store.database,owner,revision,state,next))return{state:next};}throw Error('CAS busy');}};
  const cc=await createCCIPTask(store,f.owner,ccipDraft(),async()=>ccip.config),transport=()=>localCCIPTransport(ccip.base),readCC=async()=>ccipJob((await store.read(f.owner)).state,cc.id);
  for(let i=0;i<9;i++)await runCCIPTask(store,f.owner,cc.id,transport);
  assert.equal((await readCC()).evidence.bPhase,4);assert.equal((await readCC()).reservedCents,100);pass('same D1 workspace holds CCIP result and both chain budgets pending');
  const order=await f.create(),before=await f.client.readContract({address:f.deployment.token,abi:tokenABI,functionName:'balanceOf',args:[f.deployment.vault]});await f.run(order.id);assert.ok(upstreamHash);assert.equal((await originalReceipt({hash:upstreamHash})).status,'success');
  const purchase=f.stack.store.rows('purchases')[0],nonce=purchase.payload.payload.authorization.nonce;assert.equal(purchase.payment,undefined);assert.equal(f.stack.store.summary().reserved,'200000');
  const gas=await(await fetch(f.stack.facilitator.base+'/gas')).json();assert.ok(BigInt(gas.reservedWei)>0n);assert.ok(!(await f.order(order.id)).settlement);
  const feed=await(await fetch(f.stack.supplier.base+'/v1/data-feeds')).json();assert.equal(feed.status,'blocked');assert.equal((await readCC()).reservedCents,100);assert.equal((await readCC()).evidence.aReserved,'1000000');assert.equal((await readCC()).evidence.bReserved,'1000000');
  pass('CCIP pending, depegged Feed and mined-but-unknown x402 payment coexist; all uncertain exposure stays reserved');
  await assert.rejects(f.create(),/quote service/);assert.equal(f.stack.store.summary().purchases,1);pass('abnormal Feed blocks new procurement without a replacement payment nonce');
  await f.mutate(s=>{const o=s.chainOrders.find(o=>o.id===order.id);o.failure='Order cancelled by owner during unknown payment.';o.status='awaiting-settlement';return s;});await f.run(order.id);assert.equal((await f.order(order.id)).settlement?.status,'refunded');assert.equal(f.stack.store.summary().reserved,'200000');assert.equal((await readCC()).reservedCents,100);const pendingFunds=fundsEvidence((await store.read(f.owner)).state,{[order.id]:await readX402Evidence(f.store.database,f.owner,order.id)});assert.equal(pendingFunds.records.find(r=>r.pool==='escrow'&&r.id===order.id).status,'refunded');assert.equal(pendingFunds.records.find(r=>r.pool==='supplier-token'&&r.id===order.id).amount,null);assert.equal(pendingFunds.records.find(r=>r.pool==='supplier-gas'&&r.id===order.id).amount,null);assert.equal(pendingFunds.records.find(r=>r.pool==='ccip'&&r.id===cc.id).reserved,'100');pass('owner cancellation refunds only user escrow; unknown supplier exposure and CCIP budgets remain reserved');
  observationDown=false;await f.stack.fulfillment.reconcilePending();
  for(let i=0;i<8&&!(await f.order(order.id)).settlement;i++)await f.run(order.id);
  const refunded=await f.order(order.id);assert.equal(refunded.settlement?.status,'refunded',JSON.stringify(refunded.events));assert.equal(await f.client.readContract({address:f.deployment.token,abi:tokenABI,functionName:'balanceOf',args:[f.deployment.vault]}),before);
  assert.equal((await(await fetch(f.stack.supplier.base+'/v1/data-feeds')).json()).status,'blocked');assert.equal(f.stack.store.summary().spent,'200000');assert.equal(f.stack.store.summary().reserved,'0');assert.equal((await readCC()).reservedCents,100);
  assert.equal((await f.client.getContractEvents({address:f.deployment.token,abi:authorizationABI,eventName:'AuthorizationUsed',args:{authorizer:f.stack.procurementAccount.address,nonce},fromBlock:0n})).length,1);
  pass('read-only receipt recovery accounts supplier cost after user refund; Feed stays blocked and CCIP reserve unchanged');
  ccip.faults.holdKinds=[];
  for(let i=0;i<12&&!ccipTerminal(await readCC());i++)await runCCIPTask(store,f.owner,cc.id,transport);
  assert.equal((await readCC()).status,'completed');assert.equal((await readCC()).reservedCents,0);assert.equal((await readCC()).evidence.aReserved,'0');assert.equal((await readCC()).evidence.bReserved,'0');
  const finalGas=await(await fetch(f.stack.facilitator.base+'/gas')).json();assert.equal(finalGas.reservedWei,'0');assert.equal(finalGas.transactions,1);pass('CCIP result/ACK releases only its own budget; final x402 gas reconciles to one transaction');
  return{passed:true,scope:'same-workspace CCIP/Feed/x402 concurrent fault window; local Mock chains and test assets only',checks,x402:{status:refunded.settlement.status,transaction:upstreamHash,nonce,procurement:f.stack.store.summary(),gas:finalGas},ccip:{status:(await readCC()).status,reservedCents:0},realNetworkAccepted:false};
 }finally{await f?.close();await ccip?.close();await rm(root,{recursive:true,force:true});}
}
