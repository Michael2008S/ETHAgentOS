import test from 'node:test';import assert from 'node:assert/strict';
import {seed,digest} from '../lib/agentos/engine.ts';
import {previewIdentityOrder} from '../lib/agentos/identity-order-preview.ts';
const address='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64);
const identity={agentId:'atlas',chainId:11155111,registry:address,reputationRegistry:address,registryAgentId:'11207',owner:address,wallet:address,agentURI:'data:application/json;base64,e30=',documentHash:hash,registrationTx:hash,registrationBlock:'100',registrationBlockHash:hash,checkedBlock:'101',checkedBlockHash:hash,checkedAt:'2026-10-23T00:00:00Z',status:'verified'};
test('unfunded preview snapshots bound identity, commits exact draft, replays once and creates no payment work',async()=>{
 const state={...seed(),agentIdentities:[structuredClone(identity)]},input={requestId:crypto.randomUUID(),agentId:'atlas',title:'Sepolia identity draft',budget:1000,buyer:address};
 const next=await previewIdentityOrder(state,'workspace-a',input,identity),p=next.identityOrderPreviews[0];
 assert.equal(p.agentIdentity.registryAgentId,'11207');assert.equal(p.status,'identity-preview');assert.equal(p.fundingEnabled,false);assert.deepEqual(next.chainOrders,state.chainOrders);assert.deepEqual(next.ledger,state.ledger);assert.equal(state.identityOrderPreviews,undefined);
 const {id,status,fundingEnabled,commitment,createdAt,...parameters}=p;assert.equal(commitment,await digest({version:'agentos.identity-order-preview.v1',...parameters}));
 assert.strictEqual(await previewIdentityOrder(next,'workspace-a',input,{...identity,checkedBlock:'102'}),next);
 await assert.rejects(previewIdentityOrder(next,'workspace-a',{...input,budget:2000},identity),/different parameters/);
 await assert.rejects(previewIdentityOrder(next,'workspace-b',input,identity),/different parameters/);
 state.agentIdentities[0].wallet='0x'+'3'.repeat(40);assert.equal(p.agentIdentity.wallet,address);
 await assert.rejects(previewIdentityOrder(state,'workspace-a',{...input,requestId:crypto.randomUUID()},identity),/workspace-bound/);
 await assert.rejects(previewIdentityOrder({...seed(),agentIdentities:[{...identity,status:'stale'}]},'workspace-a',input,identity),/workspace-bound/);
});
