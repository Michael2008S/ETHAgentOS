import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';
import{startCCIPService}from'../scripts/ccip/service.mjs';import{createCCIPTask,runCCIPTask,ccipJob,ccipTerminal}from'../lib/agentos/ccip-tasks.ts';import{localCCIPTransport}from'../lib/agentos/ccip-runtime.ts';import{ccipWorkspace,ccipDraft}from'./ccip-business-fixture.mjs';import{workItems}from'../lib/agentos/queue.ts';
test('CCIP business uses atomic D1 jobs, independent verification, durable two-chain recovery, refund and cancellation',async()=>{
 const root=await mkdtemp(tmpdir()+'/agentos-ccip-business-');let service;const store=ccipWorkspace();try{
  service=await startCCIPService({root,appOrigin:'http://127.0.0.1:12345',faults:{holdKinds:[3]}});const deployment=service.config,draft=ccipDraft(),created=await createCCIPTask(store,'owner',draft,async()=>deployment);
  assert.equal(store.db.prepare("SELECT COUNT(*) n FROM agentos_runtime_jobs WHERE kind='ccip'").get().n,1);assert.equal((await createCCIPTask(store,'owner',draft,async()=>{throw Error('should not reload');})).id,created.id);
  await assert.rejects(createCCIPTask(store,'owner',{...draft,budgetCents:101},async()=>deployment),/terms differ/);
  const transport=()=>localCCIPTransport(service.base),get=async id=>ccipJob((await store.read('owner')).state,id);
  for(let i=0;i<9;i++)await runCCIPTask(store,'owner',created.id,transport);
  let held=await get(created.id);assert.equal(held.evidence.bPhase,4);assert.equal(held.reservedCents,100);assert.equal(held.evidence.aReserved,'1000000');assert.equal(held.evidence.bReserved,'1000000');
  const port=Number(new URL(service.base).port);await service.close();service=undefined;
  service=await startCCIPService({root,port,appOrigin:'http://127.0.0.1:12345'});assert.deepEqual(service.config,deployment);
  for(let i=0;i<12&&!ccipTerminal(await get(created.id));i++)await runCCIPTask(store,'owner',created.id,transport);
  assert.equal((await get(created.id)).status,'completed');assert.equal((await get(created.id)).reservedCents,0);
  assert.equal((await service.fixture.b.client.getContractEvents({address:deployment.b.escrow,abi:service.fixture.b.abis.get(deployment.b.escrow),eventName:'Opened',fromBlock:0n})).length,1);
  const bad=await createCCIPTask(store,'owner',ccipDraft({scenario:'invalid-delivery'}),async()=>deployment);
  for(let i=0;i<16&&!ccipTerminal(await get(bad.id));i++)await runCCIPTask(store,'owner',bad.id,transport);
  assert.equal((await get(bad.id)).status,'refunded');assert.equal((await get(bad.id)).reservedCents,0);
  const cancelled=await createCCIPTask(store,'owner',ccipDraft(),async()=>deployment);await store.updateWorkspace('owner',s=>{const j=ccipJob(s,cancelled.id);j.cancelRequested=true;j.status='cancelling';return s;});await runCCIPTask(store,'owner',cancelled.id,transport);assert.equal((await get(cancelled.id)).status,'cancelled');
  assert.equal(workItems((await store.read('owner')).state).filter(j=>j.kind==='ccip').length,0);assert.equal(store.db.prepare("SELECT COUNT(*) n FROM agentos_runtime_jobs WHERE kind='ccip' AND status='pending'").get().n,0);
 }finally{await service?.close();store.close();await rm(root,{recursive:true,force:true});}
});
