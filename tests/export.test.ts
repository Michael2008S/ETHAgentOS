import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition, verifyReceipt } from '../lib/agentos/engine.ts';
import { buildExport } from '../lib/agentos/export.ts';
test('exported receipt retains the canonical receipt fields and integrity digest',async()=>{
  let state=await transition(seed(),{type:'create_task',taskId:'export',requestId:'export',title:'Export test',agentId:'atlas',scenario:'success',budget:1000});
  for(let expectedStep=0;expectedStep<6;expectedStep++)state=await transition(state,{type:'advance',taskId:'export',expectedStep});
  const receipt=buildExport(state,'receipt','export');assert.equal(receipt.filename,'export-receipt.json');
  assert.deepEqual(receipt.body,state.tasks[0].receipt);assert.equal(await verifyReceipt(receipt.body as never),true);
  const context=buildExport(state,'context','export');assert.deepEqual((context.body as {input:unknown}).input,state.tasks[0].input);
});
test('exports reject missing data, unknown formats and unsafe filenames',()=>{
  const state=seed();assert.throws(()=>buildExport(state,'unknown' as never),/Unknown/);assert.throws(()=>buildExport(state,'receipt','missing'),/not found/);
  state.tasks.push({id:'bad"\r\n/../../file',output:{result:true}} as never);
  const result=buildExport(state,'artifact',state.tasks[0].id);assert.match(result.filename,/^[a-zA-Z0-9._-]+$/);assert.equal(result.filename.includes('/'),false);
});
