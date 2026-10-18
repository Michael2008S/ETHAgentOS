import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, transition, wallet, verifyReceipt, authorizeOperation, assertInvariants, digest, DomainError } from '../lib/agentos/engine.ts';
import type { Workspace, Scenario, Command } from '../lib/agentos/types.ts';
const now = '2026-10-15T10:00:00.000Z';
const create = (id='a', scenario: Scenario='success', budget=500): Extract<Command,{type:"create_task"}> => ({ type:'create_task',taskId:id,requestId:id,agentId:'atlas',title:'Analyze treasury events',scenario,budget });
const step = (s: Workspace, id='a') => transition(s,{type:'advance',taskId:id,expectedStep:s.tasks.find(t=>t.id===id)!.step},now);
async function run(s: Workspace,id='a') { for(let i=0;i<8 && ['queued','running'].includes(s.tasks.find(t=>t.id===id)!.status);i++) s=await step(s,id); return s; }
test('success conserves funds, releases surplus, and generates a verifiable receipt',async()=>{
 const s=await run(await transition(seed(now),create(),now)); const t=s.tasks[0];
 assert.equal(t.status,'completed'); assert.equal(t.paid,240); assert.equal(t.output?.totalCents,75000);
 assert.deepEqual(wallet(s),{deposited:10000,spent:240,reserved:0,available:9760});
 assert.equal(await verifyReceipt(t.receipt!),true); assert.equal(await verifyReceipt({...t.receipt!,amount:241}),false);
});
test('request and command replay cannot pay twice',async()=>{
 let s=await transition(seed(now),create(),now); s=await transition(s,create(),now); assert.equal(s.tasks.length,1);
 s=await run(s); const prior=structuredClone(s); for(let i=0;i<10;i++) s=await transition(s,{type:'advance',taskId:'a',expectedStep:4},now);
 assert.deepEqual(s,prior); assert.equal(s.ledger.filter(l=>l.kind==='settle').length,1);
});
test('reusing an idempotency key with a different payload is a conflict',async()=>{
 let s=await transition(seed(now),create(),now);
 await assert.rejects(transition(s,{...create(),budget:600},now),error=>error instanceof DomainError && error.code==='IDEMPOTENCY_CONFLICT');
 s=await transition(s,{type:'topup',amount:500,requestId:'same'},now);
 await assert.rejects(transition(s,{type:'topup',amount:501,requestId:'same'},now),error=>error instanceof DomainError && error.code==='IDEMPOTENCY_CONFLICT');
 const agent={name:'Example',description:'Service',skill:'event-analysis' as const};
 s=await transition(s,{type:'register_agent',agent,requestId:'same'},now);
 await assert.rejects(transition(s,{type:'register_agent',agent:{...agent,description:'Different'},requestId:'same'},now),error=>error instanceof DomainError && error.code==='IDEMPOTENCY_CONFLICT');
});
test('receipt verification rejects a correctly rehashed but malformed receipt schema',async()=>{
 const s=await run(await transition(seed(now),create(),now)); const {digest:hash,...body}=s.tasks[0].receipt!;
 for(const patch of [{currency:'ETH'},{inputHash:'not-a-hash'},{taskId:''},{settlementId:'different'},{settledAt:'never'},{extra:true}]){
   const altered={...body,...patch};
   assert.equal(await verifyReceipt({...altered,digest:await digest(altered)} as never),false);
 }
});
test('persisted interruption resumes after settlement with one payment',async()=>{
 let s=await run(await transition(seed(now),create('a','interruption'),now)); assert.equal(s.tasks[0].status,'paused'); assert.equal(wallet(s).spent,240);
 s=JSON.parse(JSON.stringify(s)); await assert.rejects(transition(s,{type:'cancel_task',taskId:'a'},now),/settled/);
 s=await transition(s,{type:'resume_task',taskId:'a'},now); s=await run(s); assert.equal(s.tasks[0].status,'completed'); assert.equal(wallet(s).spent,240);
});
test('capability gate rejects arbitrary operations independently of scenario',()=>{
 authorizeOperation('event-analysis','dataset.read'); assert.throws(()=>authorizeOperation('event-analysis','wallet.transfer'),/outside/); assert.throws(()=>authorizeOperation('treasury-report','shell.exec'),/outside/);
});
for(const scenario of ['injection','invalid-delivery'] as const) test(`${scenario} returns full reservation and pays nothing`,async()=>{
 const s=await run(await transition(seed(now),create('a',scenario),now)); assert.equal(s.tasks[0].status,scenario==='injection'?'blocked':'refunded'); assert.equal(wallet(s).available,10000); assert.equal(wallet(s).spent,0);
});
test('revocation after reserve is enforced before execution',async()=>{
 let s=await transition(seed(now),create(),now); s=await step(await step(s)); assert.equal(wallet(s).reserved,500);
 s=await transition(s,{type:'update_policy',policy:{...s.policy,active:false}},now); s=await step(s); assert.equal(s.tasks[0].status,'blocked'); assert.equal(wallet(s).available,10000);
});
test('daily cap includes other outstanding reservations',async()=>{
 let s=seed(now); s.policy.dailyBudget=800; s=await transition(s,create('a'),now); s=await transition(s,create('b'),now);
 s=await step(await step(s,'a'),'a'); s=await step(s,'b'); assert.equal(s.tasks.find(t=>t.id==='b')!.status,'blocked'); assert.equal(wallet(s).reserved,500);
});
test('available balance cannot be over-reserved across tasks',async()=>{
 let s=seed(now); s.ledger[0].amount=600; s=await transition(s,create('a'),now);s=await transition(s,create('b'),now);
 s=await step(await step(s,'a'),'a');s=await step(await step(s,'b'),'b');assert.equal(s.tasks.find(t=>t.id==='b')!.status,'blocked');assert.equal(wallet(s).available,100);
});
test('stale step retries do not execute a subsequent operation',async()=>{
 let s=await transition(seed(now),create(),now); s=await step(s); const copy=structuredClone(s); s=await transition(s,{type:'advance',taskId:'a',expectedStep:0},now);assert.deepEqual(s,copy);
});
test('cancellation releases funds and is idempotent',async()=>{
 let s=await step(await step(await transition(seed(now),create(),now))); s=await transition(s,{type:'cancel_task',taskId:'a'},now); const copy=structuredClone(s); s=await transition(s,{type:'cancel_task',taskId:'a'},now);assert.deepEqual(s,copy);assert.equal(wallet(s).available,10000);
});
test('amounts reject fractional, negative, unsafe and underquoted values',async()=>{
 for(const budget of [-1,0,240.1,Number.MAX_SAFE_INTEGER,100]) await assert.rejects(transition(seed(now),create('a','success',budget),now));
});
test('top-up retries are idempotent; daily usage resets in UTC',async()=>{
 let s=await run(await transition(seed(now),create(),now)); s.policy.dailyBudget=600;
 s=await transition(s,{type:'topup',amount:500,requestId:'top'},now);s=await transition(s,{type:'topup',amount:500,requestId:'top'},now);assert.equal(wallet(s).deposited,10500);
 s=await transition(s,create('b'),now);s=await transition(s,{type:'advance',taskId:'b',expectedStep:0},'2026-10-16T00:00:00.000Z'); assert.equal(s.tasks[0].step,1);assertInvariants(s);
});
