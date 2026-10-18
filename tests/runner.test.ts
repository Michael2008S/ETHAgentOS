import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition, wallet } from '../lib/agentos/engine.ts';
import { runTask, pendingTasks, type RuntimeStore } from '../lib/agentos/runner.ts';
import type { Command, Scenario } from '../lib/agentos/types.ts';

async function memoryStore(scenario: Scenario = 'success') {
  let state = await transition(seed(), {type:'create_task',taskId:'test',requestId:'test',agentId:'atlas',title:'Headless execution',budget:1000,scenario});
  let revision = 0;
  const store: RuntimeStore = {
    async read() { return {state:structuredClone(state)}; },
    async execute(owner: string, command: Command) {
      for (;;) {
        const current = revision, next = await transition(state, command);
        if (current !== revision) continue;
        state = next; revision++; return {state:structuredClone(state)};
      }
    },
  };
  return store;
}
for (const [scenario,expected] of [['success','completed'],['injection','blocked'],['invalid-delivery','refunded'],['interruption','paused']] as const) test(`server runner completes ${scenario} without a browser`, async () => {
  const store = await memoryStore(scenario);
  assert.equal((await runTask(store,'owner','test',{delayMs:0})).status,expected);
  const {state}=await store.read('owner');
  assert.equal(wallet(state).reserved,0);
  assert.equal(wallet(state).spent,scenario==='success'||scenario==='interruption'?240:0);
});
test('duplicate workers race safely and stopped worker resumes durable checkpoints',async()=>{
  const store = await memoryStore();
  assert.equal((await runTask(store,'owner','test',{delayMs:0,maxTransitions:2})).status,'retryable');
  assert.equal((await store.read('owner')).state.tasks[0].reserved,1000);
  await Promise.all(Array.from({length:5},()=>runTask(store,'owner','test',{delayMs:0})));
  const {state}=await store.read('owner');assert.equal(state.tasks[0].status,'completed');
  assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);
});
test('worker retry is bounded and transient storage failure can recover',async()=>{
  const store = await memoryStore(); let attempts = 0;
  const read = store.read;
  store.read=async owner => {if(attempts++<2)throw new Error('Temporary storage failure');return read(owner);};
  const result=await runTask(store,'owner','test',{delayMs:0});assert.equal(result.status,'completed');assert.equal(result.retries,2);
  store.read=async()=>{throw new Error('Unavailable');};
  assert.deepEqual(await runTask(store,'owner','test',{delayMs:0,maxRetries:2}),{taskId:'test',status:'retryable',transitions:0,retries:2});
});
test('automatic scheduling excludes manual tests, terminal and paused tasks',async()=>{
  const store=await memoryStore('interruption');let {state}=await store.read('owner');assert.equal(pendingTasks(state).length,1);
  state.tasks[0].executionMode='manual';assert.equal(pendingTasks(state).length,0);
  await runTask(store,'owner','test',{delayMs:0});state=(await store.read('owner')).state;assert.equal(pendingTasks(state).length,0);
  await store.execute('owner',{type:'resume_task',taskId:'test'});await runTask(store,'owner','test',{delayMs:0});
  state=(await store.read('owner')).state;assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);
});
