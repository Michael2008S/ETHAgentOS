import test from 'node:test';import assert from 'node:assert/strict';
import {x402Fixture} from './x402-fixture.mjs';
import {ProcurementStore} from '../scripts/x402/procurement-store.mjs';
import {procurementClient} from '../scripts/x402/client.mjs';
import {jsonCall} from '../scripts/x402/http.mjs';
test('repeated 402 retains one authorization and reserves exposure until its onchain expiry proves it unpaid',async()=>{
 const f=await x402Fixture(),store=new ProcurementStore();let signatures=0;try{
  await jsonCall(f.report.base+'/testing',{mode:'repeat-402'});const procurement=procurementClient({policy:f.policy,client:f.client,store,account:{...f.accounts[1],signTypedData:async data=>{signatures++;return f.accounts[1].signTypedData(data);}},authorize:async()=>({authorized:true})});
  await assert.rejects(procurement.execute(f.request,'controlled-repeat-ticket'),/Original x402 payment refused/);const nonce=store.get('purchases',f.request.jobId).payload.payload.authorization.nonce;
  await assert.rejects(procurement.execute(f.request,'controlled-repeat-ticket'),/Original x402 payment refused/);assert.equal(signatures,1);assert.equal(store.get('purchases',f.request.jobId).payload.payload.authorization.nonce,nonce);assert.equal(store.summary().reserved,'200000');
  await f.provider.request({method:'evm_increaseTime',params:[65]});await f.provider.request({method:'evm_mine',params:[]});assert.equal((await procurement.reconcile(f.request.jobId)).state,'unpaid');assert.equal(store.summary().reserved,'0');assert.equal(store.summary().spent,'0');
  await assert.rejects(procurement.execute(f.request,'controlled-repeat-ticket'),/ended without payment/);assert.equal(signatures,1);
 }finally{store.close();await f.close();}
});
