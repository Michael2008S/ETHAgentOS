import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelPlanner,parseModelConfiguration } from '../lib/agentos/model.ts';
import { seed } from '../lib/agentos/engine.ts';
import { claimModelLease,commitModelPlan } from '../lib/agentos/orders.ts';
import type { ChainOrder } from '../lib/agentos/orders.ts';
const config=parseModelConfiguration({url:'https://model.example/v1/chat/completions',model:'test-model',revision:'pinned'});
const order={id:'model-order',title:'Analyze transfers',skill:'event-analysis',input:{dataset:'eth-shenzhen-fixture-v1',blockFrom:1,blockTo:2}} as ChainOrder;
const envelope=(content:unknown,finish_reason='stop')=>new Response(JSON.stringify({choices:[{finish_reason,message:{content}}],usage:{prompt_tokens:21,completion_tokens:10},id:'completion-test'}));
test('model protocol is bounded, hashes evidence and never persists provider credentials',async()=>{
 let body:Record<string,unknown>|undefined;
 const planner=await createModelPlanner(config,'private-provider-secret',async(input,init)=>{assert.equal(input,config.url);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-provider-secret');assert.equal(init?.redirect,'manual');body=JSON.parse(String(init?.body));return envelope('{"operations":["dataset.read","artifact.write"]}');});
 const plan=await planner.plan(order);assert.deepEqual(plan.operations,['dataset.read','artifact.write']);assert.equal(plan.usage?.completionTokens,10);assert.match(plan.responseHash,/^0x[0-9a-f]{64}$/);assert.equal(JSON.stringify(plan).includes('private-provider-secret'),false);assert.equal(JSON.stringify(body).includes('private-provider-secret'),false);assert.equal(body?.max_tokens,128);
 for(const response of [envelope('not json'),envelope('{"operations":["dataset.read"]}','length'),new Response('null'),new Response('x'.repeat(65537)),envelope('{"operations":["unrestricted.shell"]}'),new Response('provider-secret',{status:500}),new Response(null,{status:302,headers:{Location:'https://private.example'}})]){
  const bad=await createModelPlanner(config,undefined,async()=>response);await assert.rejects(bad.plan(order),error=>error instanceof Error&&!error.message.includes('provider-secret'));
 }
 const unavailable=await createModelPlanner(config,undefined,async()=>{throw new Error('https://private-key.example');});await assert.rejects(unavailable.plan(order),/inference is unavailable/);
});
test('model endpoint and resource configuration is server controlled',()=>{
 for(const patch of [{url:'http://model.example/v1/chat/completions'},{url:'https://secret@model.example/v1/chat/completions'},{url:'https://model.example/v1/chat/completions?api_key=secret'},{timeoutMs:999999},{maxTokens:999999},{apiKey:'secret'}])assert.throws(()=>parseModelConfiguration({...config,...patch}));
 assert.throws(()=>parseModelConfiguration({...config,url:'http://127.0.0.1:11435/v1/chat/completions'}));assert.equal(parseModelConfiguration({...config,url:'http://127.0.0.1:11435/v1/chat/completions'},true).model,'test-model');
 assert.equal(parseModelConfiguration({...config,url:'http://127.0.0.1:11436/v1/chat/completions'},true).model,'test-model');assert.throws(()=>parseModelConfiguration({...config,url:'http://127.0.0.1:11437/v1/chat/completions'},true));
});
test('model leases reject stale workers, cancelled results and permission changes',async()=>{
 const planner=await createModelPlanner(config,undefined,async()=>envelope('{"operations":["dataset.read","artifact.write"]}'));
 const now='2026-10-19T00:00:00.000Z',state=seed(now),o={...order,planner:'llm',model:planner.descriptor,step:2,status:'running',funding:{},events:[],agentId:'atlas',budget:1000,deadlineAt:'2026-10-19T01:00:00.000Z'} as unknown as ChainOrder;state.chainOrders=[o];
 const first=claimModelLease(state,o.id,'first',now);assert.strictEqual(claimModelLease(first,o.id,'second',now),first);
 const renewed=claimModelLease(first,o.id,'second','2026-10-19T00:02:00.000Z'),plan=await planner.plan(order);
 assert.strictEqual(commitModelPlan(renewed,o.id,'first',{plan},'2026-10-19T00:02:01.000Z'),renewed);
 const cancelled=structuredClone(renewed);cancelled.chainOrders![0].status='awaiting-settlement';assert.strictEqual(commitModelPlan(cancelled,o.id,'second',{plan},'2026-10-19T00:02:01.000Z'),cancelled);
 renewed.policy.active=false;const rejected=commitModelPlan(renewed,o.id,'second',{plan},'2026-10-19T00:02:01.000Z');assert.equal(rejected.chainOrders![0].output,undefined);assert.equal(rejected.chainOrders![0].status,'awaiting-settlement');assert.match(rejected.chainOrders![0].failure!,/revoked/);
});
