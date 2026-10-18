import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, expectedOutput, normalizeInput, seed, transition, verifyReceipt, wallet } from '../lib/agentos/engine.ts';
import type { Command, TaskInput } from '../lib/agentos/types.ts';
const input: TaskInput={dataset:'custom-transfers-v1',blockFrom:5,blockTo:10,records:[{block:4,from:'outside',to:'skip',cents:9999},{block:5,from:'buyer',to:'alpha',cents:123},{block:7,from:'buyer',to:'alpha',cents:456},{block:10,from:'buyer',to:'beta',cents:789}]};
const create: Extract<Command,{type:'create_task'}>={type:'create_task',taskId:'custom',requestId:'custom',agentId:'sage',title:'User data',budget:1000,scenario:'success',input};

test('custom data is frozen, range filtered, independently verified and bound to the receipt',async()=>{
  let s=await transition(seed(),create);
  const accepted=structuredClone(s.tasks[0].input);
  input.records![0].cents=9998;
  assert.deepEqual(s.tasks[0].input,accepted);input.records![0].cents=9999;
  for(let step=0;step<6;step++)s=await transition(s,{type:'advance',taskId:'custom',expectedStep:step});
  assert.equal(s.tasks[0].status,'completed');assert.equal(s.tasks[0].output!.totalCents,1368);assert.equal(s.tasks[0].output!.transferCount,3);
  assert.deepEqual(s.tasks[0].output!.allocations,{alpha:579,beta:789});
  assert.equal(s.tasks[0].receipt!.inputHash,await digest(accepted));assert.equal(s.tasks[0].inputHash,s.tasks[0].receipt!.inputHash);
  assert.equal(await verifyReceipt(s.tasks[0].receipt!),true);
  await assert.rejects(transition(s,{...create,input:{...input,blockTo:9}}),error=>error instanceof Error&&'code' in error&&error.code==='IDEMPOTENCY_CONFLICT');
});

test('invalid custom delivery is rejected without payment and labels cannot pollute allocation objects',async()=>{
  let s=await transition(seed(),{...create,scenario:'invalid-delivery'});
  for(let step=0;step<4;step++)s=await transition(s,{type:'advance',taskId:'custom',expectedStep:step});
  assert.equal(s.tasks[0].status,'refunded');assert.equal(wallet(s).spent,0);assert.equal(wallet(s).reserved,0);
  const output=expectedOutput({skill:'treasury-report',input:{dataset:'custom-transfers-v1',blockFrom:0,blockTo:1,records:[{block:1,from:'a',to:'__proto__',cents:1},{block:1,from:'a',to:'constructor',cents:2}]}});
  assert.deepEqual(JSON.parse(JSON.stringify(output.allocations)),JSON.parse('{"__proto__":1,"constructor":2}'));
});

test('input schema rejects malformed records, unsafe aggregates and invalid ranges',()=>{
  for(const patch of [{dataset:'unknown'},{blockFrom:-1},{blockFrom:11},{blockTo:0.5},{records:[]},{records:Array(101).fill(input.records![0])},{records:[{...input.records![0],cents:-1}]},{records:[{...input.records![0],cents:1.5}]},{records:[{...input.records![0],from:' '}]},{records:[{...input.records![0],block:NaN}]},{records:[{...input.records![0],cents:Number.MAX_SAFE_INTEGER},{...input.records![0],cents:1}]}])assert.throws(()=>normalizeInput({...input,...patch}));
  assert.throws(()=>normalizeInput({...input,dataset:'eth-shenzhen-fixture-v1'}),/override/);
});
