import test from 'node:test';import assert from 'node:assert/strict';
import {x402VaultFixture} from './x402-vault-fixture.mjs';
import {tokenABI,escrowABI} from '../sdk/chain.ts';
import {vaultABI} from '../lib/agentos/vault.ts';
import {readX402Evidence} from '../lib/agentos/x402-evidence.ts';
import {supplierJobId,supplierRequest} from '../lib/agentos/supplier.ts';
import {jsonCall} from '../scripts/x402/http.mjs';
import {issueX402Ticket,authorizeX402} from '../lib/agentos/x402-authority.ts';
import {digest} from '../lib/agentos/engine.ts';

test('real x402 report purchase, Vault escrow, independent acceptance, refund and lost-response recovery reconcile both money paths',async()=>{
 const f=await x402VaultFixture();try{
  const balance=address=>f.client.readContract({address:f.deployment.token,abi:tokenABI,functionName:'balanceOf',args:[address]}),vaultBefore=await balance(f.deployment.vault),procurementBefore=await balance(f.stack.procurementAccount.address),sellerBefore=await balance(f.identity.wallet),merchantBefore=await balance(f.stack.policy.payTo);
  await assert.rejects(f.create({x402Review:undefined}),/reviewed x402/);
  for(const mode of ['healthy','wrong-result','lost-response']){
   await jsonCall(f.stack.report.base+'/testing',{mode});const order=await f.create();
   await Promise.all([f.run(order.id),f.run(order.id)]);const done=await f.order(order.id);
   assert.equal(done.settlement?.status,mode==='wrong-result'?'refunded':'paid',JSON.stringify(done.events));assert.equal(done.funding.buyer.toLowerCase(),f.deployment.vault.toLowerCase());
   const request=await supplierRequest(done),e=await readX402Evidence(f.store.database,f.owner,done.id);assert.ok(e.terms.payment);assert.ok(e.terms.report);assert.equal(e.terms.jobId,supplierJobId(request));assert.equal(await readX402Evidence(f.store.database,'another-owner',done.id),undefined);
   if(mode==='wrong-result'){assert.equal(done.output,null);assert.match(done.failure,/independent recomputation/);}
   assert.equal((await f.client.getContractEvents({address:f.deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:done.funding.taskId},fromBlock:0n})).length,1);
   assert.equal((await f.client.getContractEvents({address:f.deployment.escrow,abi:escrowABI,eventName:'Settled',args:{id:done.funding.taskId},fromBlock:0n})).length,1);
  }
  assert.equal(vaultBefore-await balance(f.deployment.vault),2000000n);assert.equal(await balance(f.identity.wallet)-sellerBefore,2000000n);
  assert.equal(procurementBefore-await balance(f.stack.procurementAccount.address),600000n);assert.equal(await balance(f.stack.policy.payTo)-merchantBefore,600000n);
  assert.equal(await f.client.readContract({address:f.deployment.vault,abi:vaultABI,functionName:'spent',args:[f.deployment.vaultExecutor,(await f.client.getBlock()).timestamp/86400n]}),3000000n,'refund cannot restore gross daily allowance');
  assert.equal(f.stack.store.summary({network:f.stack.policy.network,asset:f.stack.policy.asset,payer:f.stack.procurementAccount.address.toLowerCase()}).reserved,'0');
  // Exercise application authority races on an explicitly reset state-machine fixture.
  const original=(await f.store.read(f.owner)).state.chainOrders[0];
  await f.mutate(async s=>{const o=s.chainOrders[0];o.status='running';o.step=2;o.failure=null;o.settlement=null;delete o.settlementAuthorization;delete o.supplierDelivery;o.supplierLease={token:crypto.randomUUID(),expiresAt:new Date(Date.now()+60000).toISOString(),requestHash:await digest(await supplierRequest(o))};return s;});
  const leased=await f.order(original.id),ticket=await issueX402Ticket(f.store,f.owner,leased,'http://127.0.0.1:12345'),jobId=supplierJobId(await supplierRequest(leased)),preflight={action:'preflight',jobId};
  assert.equal((await authorizeX402(f.store,ticket.token,preflight,async()=>{})).scope,f.scope);
  await assert.rejects(authorizeX402(f.store,ticket.token,{...preflight,ownerId:'another-owner'},async()=>{}));
  await assert.rejects(authorizeX402(f.store,ticket.token,{...preflight,jobId:'0x'+'0'.repeat(64)},async()=>{}),/authority/);
  await assert.rejects(authorizeX402(f.store,ticket.token,preflight,async()=>{},Date.now()+65000),/authority/);
  await assert.rejects(authorizeX402(f.store,ticket.token,{action:'commit',jobId,nonce:'0x'+'2'.repeat(64),intentHash:'0x'+'3'.repeat(64)},async()=>{}),/replacement payment/);
  await assert.rejects(authorizeX402(f.store,ticket.token,preflight,async()=>{await f.mutate(s=>({...s,policy:{...s.policy,active:false}}));}),/authority/,'revocation while RPC is awaited must be reread');
  await f.mutate(s=>({...s,policy:{...s.policy,active:true}}));
  await f.mutate(s=>{s.chainOrders[0].supplierLease.token=crypto.randomUUID();return s;});
  await assert.rejects(authorizeX402(f.store,ticket.token,preflight,async()=>{}),/authority/,'old lease cannot regain authority');
 }finally{await f.close();}
});
