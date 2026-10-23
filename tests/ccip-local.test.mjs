import test from 'node:test';
import assert from 'node:assert/strict';
import {createCCIPFixture} from '../scripts/ccip/local-fixture.mjs';

test('CCIP local A authorization → B Vault escrow → result/ack retains pending budgets',async()=>{
 const f=await createCCIPFixture();
 try {
  const {a,b}=f,id=f.id('success'),[message]=await f.authorize(id);
  assert.equal(await a.read(a.lane,'reserved'),1_000_000n);
  await f.deliver(b,message);assert.equal((await f.task(b,id))[3],2);
  await b.tx(b.lane,'execute',[id]);assert.equal((await b.read(b.escrow,'tasks',[id]))[0].toLowerCase(),b.vault.toLowerCase());
  const [result]=await f.settle(id,true);
  assert.equal(await a.read(a.lane,'reserved'),1_000_000n);assert.equal(await b.read(b.lane,'reserved'),1_000_000n);
  const [ack]=await f.messages(a,await f.deliver(a,result));
  assert.equal(await a.read(a.lane,'reserved'),0n);assert.equal(await b.read(b.lane,'reserved'),1_000_000n);
  await f.deliver(b,ack);assert.equal(await b.read(b.lane,'reserved'),0n);
  assert.equal(await a.read(a.token,'balanceOf',[a.vault]),f.cap);
  assert.equal(await b.read(b.token,'balanceOf',[b.vault]),f.cap-1_000_000n);
  assert.equal(await b.read(b.token,'balanceOf',[b.seller]),1_000_000n);
 } finally {await f.close();}
});

import {runCCIPAcceptance} from '../scripts/ccip/acceptance.mjs';
test('CCIP local security, ordering, revocation, pending budgets and failure recovery',async()=>{
 const report=await runCCIPAcceptance();assert.equal(report.passed,true);assert.equal(report.checks.length,12);assert.equal(report.realCCIPNetworkAccepted,false);
});
