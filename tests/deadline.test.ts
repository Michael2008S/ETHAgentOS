import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition, wallet, verifyReceipt } from '../lib/agentos/engine.ts';
import { taskDeadline } from '../lib/agentos/lifecycle.ts';
import { pendingTasks, runTask } from '../lib/agentos/runner.ts';
import type { Command, Workspace } from '../lib/agentos/types.ts';

const start = '2026-10-19T00:00:00.000Z', end = '2026-10-19T00:00:10.000Z';
const create: Extract<Command, {type:'create_task'}> = {type:'create_task',taskId:'deadline',requestId:'deadline',agentId:'atlas',title:'Finite execution',budget:500,scenario:'success',timeoutSeconds:10};
const advance = (s: Workspace, now = start) => transition(s,{type:'advance',taskId:create.taskId,expectedStep:s.tasks[0].step},now);

test('deadline bounds every unpaid phase, including final settlement, with one refund', async () => {
  for (let phase=0; phase<=4; phase++) {
    let state = await transition(seed(start),create,start);
    for (let i=0; i<phase; i++) state = await advance(state);
    state = await advance(state,end);
    assert.equal(state.tasks[0].status,'expired'); assert.equal(state.tasks[0].paid,0);
    assert.deepEqual(wallet(state),{deposited:10000,available:10000,spent:0,reserved:0});
    const snapshot = structuredClone(state);
    for (const type of ['expire_task','resume_task','cancel_task'] as const) state = await transition(state,{type,taskId:create.taskId},end);
    state = await advance(state,end); assert.deepEqual(state,snapshot);
    assert.equal(state.ledger.filter(l=>l.kind==='release').length,phase>=2?1:0);
  }
});

test('settlement just before deadline is final and can recover after the deadline', async () => {
  let state = await transition(seed(start),{...create,scenario:'interruption'},start);
  for (let i=0; i<5; i++) state = await advance(state,'2026-10-19T00:00:09.999Z');
  const receipt=structuredClone(state.tasks[0].receipt);
  state = await transition(state,{type:'expire_task',taskId:create.taskId},end);
  assert.equal(state.tasks[0].status,'paused');
  state = await transition(state,{type:'resume_task',taskId:create.taskId},end);
  state = await advance(state,end);
  assert.equal(state.tasks[0].status,'completed'); assert.deepEqual(state.tasks[0].receipt,receipt);
  assert.equal(await verifyReceipt(state.tasks[0].receipt!),true);
  assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);
});

test('expired paused checkpoints are recovered by workers; early expiry cannot cancel work', async () => {
  let state=await transition(seed(start),create,start);
  assert.deepEqual(await transition(state,{type:'expire_task',taskId:create.taskId},start),state);
  state=await advance(await advance(state)); state.tasks[0].status='paused';
  assert.equal(pendingTasks(state,undefined,start).length,0);
  assert.equal(pendingTasks(state,undefined,end).length,1);
  const store={async read(){return {state};},async execute(_owner: string,command: Command){state=await transition(state,command,end);return {state};}};
  assert.equal((await runTask(store,'owner',create.taskId,{delayMs:0,now:()=>end})).status,'expired');
  assert.equal(wallet(state).reserved,0);
  const legacy={...state.tasks[0]}; delete legacy.deadlineAt; delete legacy.timeoutSeconds;
  assert.equal(taskDeadline(legacy),'2026-10-19T00:05:00.000Z');
});

test('execution windows are validated and retries preserve the original deadline', async () => {
  for (const timeoutSeconds of [0,-1,0.5,86401,NaN,Infinity]) await assert.rejects(transition(seed(start),{...create,timeoutSeconds},start),/Execution window/);
  const state=await transition(seed(start),create,start);
  assert.deepEqual(await transition(state,create,end),state);
  await assert.rejects(transition(state,{...create,timeoutSeconds:11},start),error=>error instanceof Error && 'code' in error && error.code==='IDEMPOTENCY_CONFLICT');
});
