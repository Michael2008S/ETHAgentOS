import test from 'node:test';import assert from 'node:assert/strict';
import {x402Fixture} from './x402-fixture.mjs';
import {createPayload,authorizationABI} from '../scripts/x402/protocol.mjs';
import {jsonCall} from '../scripts/x402/http.mjs';
test('insufficient independent facilitator gas budget blocks broadcast without consuming a token authorization',async()=>{
 const f=await x402Fixture({dailyGasWei:1n});try{
  const payload=await createPayload(f.policy,f.report.requirements(),{url:f.report.base+f.policy.path},f.accounts[1],'pay_gas_budget_test_001');
  await assert.rejects(jsonCall(f.fac.base+'/settle',{paymentPayload:payload,paymentRequirements:f.report.requirements()}));
  assert.equal(await f.client.readContract({address:f.token,abi:authorizationABI,functionName:'authorizationState',args:[f.accounts[1].address,payload.payload.authorization.nonce]}),false);
  const gas=await(await fetch(f.fac.base+'/gas')).json();assert.equal(gas.transactions,0);assert.equal(gas.spentWei,'0');assert.equal(gas.reservedWei,'0');
 }finally{await f.close();}
});
