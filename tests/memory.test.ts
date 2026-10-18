import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition } from '../lib/agentos/engine.ts';
import { parseMemoryQuery, queryMemory, exportMemory } from '../lib/agentos/memory.ts';

async function workspace(){
  let state=seed('2026-10-19T00:00:00.000Z');
  for(let i=0;i<25;i++)state=await transition(state,{type:'create_task',taskId:'task-'+i,requestId:'req-'+i,agentId:i%2?'sage':'atlas',title:'Memory '+i,budget:1000,scenario:'success',...(i===0?{input:{dataset:'custom-transfers-v1',blockFrom:0,blockTo:10,records:[{block:1,from:'treasury.eth',to:'research.eth',cents:100}]}}:{})},new Date(Date.parse(state.createdAt)+i*1000).toISOString());
  for(let step=0;step<6;step++)state=await transition(state,{type:'advance',taskId:'task-0',expectedStep:step},'2026-10-19T00:00:30.000Z');
  return state;
}
const query=(value='')=>parseMemoryQuery(new URLSearchParams(value));
test('memory search combines owner data, agent, status, artifacts and nested context with stable pages',async()=>{
  const state=await workspace(),before=structuredClone(state);
  const first=queryMemory(state,query()),second=queryMemory(state,query('offset=20'));
  assert.equal(first.total,25);assert.equal(first.items.length,20);assert.equal(second.items.length,5);
  assert.equal(new Set([...first.items,...second.items].map(t=>t.id)).size,25);
  assert.equal(queryMemory(state,query('agentId=sage')).total,12);
  assert.equal(queryMemory(state,query('status=completed&artifactsOnly=true&q=RESEARCH.ETH')).items[0].id,'task-0');
  assert.equal(queryMemory(state,query('q='+state.tasks.find(t=>t.id==='task-0')!.receipt!.digest)).total,1);
  assert.equal(queryMemory(state,query('agentId=sage&status=completed')).total,0);
  assert.equal(queryMemory(seed(),query('q=Memory')).total,0);assert.deepEqual(state,before);
});
test('filtered memory export includes every match and preserves original input, output and receipt',async()=>{
  const state=await workspace(),all=exportMemory(state,query('limit=1&offset=20&agentId=sage'));
  assert.equal(all.total,12);assert.equal(all.items.length,12);
  const completed=exportMemory(state,query('artifactsOnly=true')).items[0],task=state.tasks.find(t=>t.id===completed.taskId)!;
  assert.deepEqual(completed.receipt,task.receipt);assert.deepEqual(completed.input,task.input);assert.deepEqual(completed.output,task.output);
});
test('memory query rejects oversized, invalid and unbounded filter values',()=>{
  for(const params of ['offset=-1','limit=0','limit=51','offset=1.5','offset=Infinity','status=unknown','artifactsOnly=maybe','q='+ 'a'.repeat(201),'agentId='+ 'a'.repeat(129)])assert.throws(()=>query(params),/Invalid memory/);
});
