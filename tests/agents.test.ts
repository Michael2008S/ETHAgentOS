import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition, wallet } from '../lib/agentos/engine.ts';
import type { Command, Workspace } from '../lib/agentos/types.ts';
const create=(id: string, scenario='success'): Command=>({type:'create_task',taskId:id,requestId:id,agentId:'atlas',title:id,budget:1000,scenario:scenario as 'success'|'interruption'});
async function advance(s: Workspace, id: string, count: number){for(let i=0;i<count;i++)s=await transition(s,{type:'advance',taskId:id,expectedStep:s.tasks.find(t=>t.id===id)!.step});return s;}

test('service quote changes apply only to future orders and do not alter accepted commitments',async()=>{
  let s=await transition(seed(),create('original'));
  s=await transition(s,{type:'update_agent',agentId:'atlas',price:750,enabled:true});
  s=await transition(s,create('new'));
  assert.equal(s.tasks.find(t=>t.id==='original')!.quote,240);assert.equal(s.tasks.find(t=>t.id==='new')!.quote,750);
  s=await advance(s,'original',6);s=await advance(s,'new',6);
  assert.equal(s.tasks.find(t=>t.id==='original')!.paid,240);assert.equal(s.tasks.find(t=>t.id==='new')!.paid,750);
  assert.equal(wallet(s).reserved,0);
});

test('disabling a service atomically releases unpaid work and preserves paid recovery',async()=>{
  let s=await transition(seed(),create('unpaid'));s=await advance(s,'unpaid',2);
  s=await transition(s,create('paid','interruption'));s=await advance(s,'paid',5);
  const receipt=structuredClone(s.tasks.find(t=>t.id==='paid')!.receipt);
  const disable: Command={type:'update_agent',agentId:'atlas',price:240,enabled:false};
  s=await transition(s,disable);
  assert.equal(s.tasks.find(t=>t.id==='unpaid')!.status,'blocked');assert.equal(wallet(s).reserved,0);
  assert.equal(s.tasks.find(t=>t.id==='paid')!.status,'paused');
  const copy=structuredClone(s);s=await transition(s,disable);assert.deepEqual(s,copy);
  await assert.rejects(transition(s,create('denied')),/disabled/);
  // A retry of an already accepted order remains idempotent after service changes.
  assert.deepEqual(await transition(s,create('unpaid')),s);
  s=await transition(s,{type:'resume_task',taskId:'paid'});s=await advance(s,'paid',1);
  assert.deepEqual(s.tasks.find(t=>t.id==='paid')!.receipt,receipt);
  assert.equal(s.ledger.filter(l=>l.kind==='settle').length,1);
  s=await transition(s,{...disable,enabled:true});s=await transition(s,create('reenabled'));
  assert.equal(s.tasks[0].status,'queued');assert.equal(s.tasks.find(t=>t.id==='unpaid')!.status,'blocked');
});

test('service management validates price and service identity',async()=>{
  for(const price of [0,-1,0.5,1000001,Infinity])await assert.rejects(transition(seed(),{type:'update_agent',agentId:'atlas',price,enabled:true}));
  await assert.rejects(transition(seed(),{type:'update_agent',agentId:'missing',price:100,enabled:true}),/Unknown agent/);
});
