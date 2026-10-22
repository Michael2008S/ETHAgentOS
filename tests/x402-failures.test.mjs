import test from 'node:test';import assert from 'node:assert/strict';
import {x402VaultFixture} from './x402-vault-fixture.mjs';
import {jsonCall} from '../scripts/x402/http.mjs';
import {tokenABI} from '../sdk/chain.ts';
import {readX402Evidence} from '../lib/agentos/x402-evidence.ts';
test('overpriced challenge refunds without authorizing, and invalid paid response or cancellation refunds while preserving supplier cost',async()=>{
 let cancel=false,f;f=await x402VaultFixture({afterPayment:async()=>{if(cancel)await f.mutate(s=>{const o=s.chainOrders[0];o.failure='Order cancelled by its owner.';o.status='awaiting-settlement';return s;});}});
 try{
  const balance=()=>f.client.readContract({address:f.deployment.token,abi:tokenABI,functionName:'balanceOf',args:[f.deployment.vault]}),initial=await balance();
  for(const mode of ['overpriced','wrong-signature','healthy']){
   cancel=mode==='healthy';await jsonCall(f.stack.report.base+'/testing',{mode});const o=await f.create();await f.run(o.id);const done=await f.order(o.id);assert.equal(done.settlement?.status,'refunded',JSON.stringify(done.events));assert.equal(done.output,null);assert.equal(await balance(),initial);
   const e=await readX402Evidence(f.store.database,f.owner,o.id);assert.equal(!!e.terms.payment,mode!=='overpriced');if(mode==='overpriced'){assert.equal(f.stack.store.rows('purchases').length,0);assert.equal(e.terms.state,'rejected');}else if(mode==='wrong-signature'){assert.equal(e.terms.report,undefined);assert.equal(e.terms.state,'paid');}else{assert.match(done.failure,/cancelled/);assert.ok(e.terms.report);assert.equal(done.supplierDelivery,undefined);}
   const old=done.settlement.transactionHash;await f.run(o.id);assert.equal((await f.order(o.id)).settlement.transactionHash,old,'late recovery cannot purchase or settle again');
  }
  assert.deepEqual(f.stack.store.summary(),{spent:'400000',reserved:'0',purchases:2});
 }finally{await f.close();}
});
