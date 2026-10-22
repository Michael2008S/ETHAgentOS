import test from 'node:test';import assert from 'node:assert/strict';
import {x402Fixture} from './x402-fixture.mjs';
import {ProcurementStore} from '../scripts/x402/procurement-store.mjs';
import {procurementClient} from '../scripts/x402/client.mjs';
import {authorizationABI} from '../scripts/x402/protocol.mjs';

test('durable x402 procurement recovers the original signed authorization after a crash and concurrent retries',async()=>{
 const f=await x402Fixture();let store=new ProcurementStore(f.root+'/procurements.sqlite');try{
  const approved=new Map(),authorize=async(ticket,intent)=>{assert.equal(ticket,'controlled-test-ticket');if(intent.action==='commit'){const prior=approved.get(intent.jobId);if(prior)assert.deepEqual(prior,intent);approved.set(intent.jobId,intent);}};
  const make=afterPersist=>procurementClient({policy:f.policy,account:f.accounts[1],client:f.client,store,authorize,afterPersist});
  await assert.rejects(make(async()=>{throw Error('Crash after durable signature, before HTTP submission.');}).execute(f.request,'controlled-test-ticket'),/Crash/);
  const old=store.get('purchases',f.request.jobId),nonce=old.payload.payload.authorization.nonce;
  assert.equal(store.summary().reserved,'200000');assert.equal(store.summary().spent,'0');
  store.close();store=new ProcurementStore(f.root+'/procurements.sqlite');
  await fetch(f.report.base+'/testing',{method:'POST',body:JSON.stringify({mode:'lost-response'})});
  const resumed=make(),results=await Promise.all(Array.from({length:3},()=>resumed.execute(f.request,'controlled-test-ticket')));
  assert.equal(results[0].report.terms.nonce,nonce);assert.ok(results.every(r=>r.payment.transaction===results[0].payment.transaction));
  assert.deepEqual(store.summary(),{spent:'200000',reserved:'0',purchases:1});
  assert.equal((await f.client.getContractEvents({address:f.token,abi:authorizationABI,eventName:'AuthorizationUsed',fromBlock:0n})).length,1);
  assert.equal(store.rows('purchases').length,1);
 }finally{store.close();await f.close();}
});

test('shared procurement budgets retain unknown cross-day exposure, fence changed intents and never charge a new nonce on rejection',()=>{
 const store=new ProcurementStore();try{
  const base={network:'eip155:31337',asset:'token',payer:'same-operator-wallet'},before=Date.parse('2026-10-22T23:59:59Z'),after=Date.parse('2026-10-23T00:00:01Z');
  store.reserve('workspace-A',{...base,jobId:'A'},'20','30',{},before);
  assert.throws(()=>store.reserve('workspace-B',{...base,jobId:'B'},'20','30',{},after),/daily cap/);
  assert.throws(()=>store.reserve('workspace-A',{...base,jobId:'different-input'},'20','30',{},after),/conflicts/);
  store.intent('workspace-A',{nonce:'fixed'});assert.throws(()=>store.intent('workspace-A',{nonce:'replacement'}),/second nonce/);
  store.update('workspace-A',{payment:{blockTimestamp:String(Math.floor(after/1000))},state:'paid'});
  assert.throws(()=>store.reserve('workspace-B',{...base,jobId:'B'},'20','30',{},after),/daily cap/);
  store.reserve('another-wallet',{...base,payer:'independent-wallet',jobId:'C'},'20','30',{},after);
  assert.deepEqual(store.summary(),{spent:'20',reserved:'20',purchases:2});
 }finally{store.close();}
});
