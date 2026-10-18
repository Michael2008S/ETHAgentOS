import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { seed,transition } from '../lib/agentos/engine.ts';
import { commitWithJobs,claimJob,acknowledgeJob,queueSummary,jobId } from '../lib/agentos/queue.ts';
import { runTask } from '../lib/agentos/runner.ts';
import { drainScope } from '../lib/agentos/auth.ts';

function database() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('drizzle/0000_parallel_roland_deschain.sql','utf8'));
  sqlite.exec(readFileSync('drizzle/0001_chemical_famine.sql','utf8'));
  const database={prepare(sql){return {bind(...parameters){return {sql,parameters,
    async first(){return sqlite.prepare(sql).get(...parameters)??null;},
    async all(){return {results:sqlite.prepare(sql).all(...parameters)};},
    async run(){return {meta:sqlite.prepare(sql).run(...parameters)};},
  };},};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const read=async owner=>{const row=sqlite.prepare('SELECT revision,data FROM agentos_workspaces WHERE owner_id=?').get(owner);return {revision:row.revision,state:JSON.parse(row.data)};};
  const insert=(owner,state=seed())=>sqlite.prepare('INSERT INTO agentos_workspaces VALUES (?,0,?)').run(owner,JSON.stringify(state));
  return {database,sqlite,read,insert};
}
const draft=(id='queued',extra={})=>({type:'create_task',taskId:id,requestId:id,agentId:'atlas',title:'Durable queue '+id,budget:1000,scenario:'success',...extra});

test('workspace and enqueue commit atomically; CAS loser cannot publish an orphan',async()=>{
  const d=database();d.insert('a');const before=seed(),next=await transition(before,draft('winner')),loser=await transition(before,draft('loser'));
  assert.equal(await commitWithJobs(d.database,'a',0,before,next),true);
  assert.equal(await commitWithJobs(d.database,'a',0,before,loser),false);
  assert.deepEqual(await queueSummary(d.database,'a'),{pending:1,leased:0,completed:0,dead:0});
  assert.equal(d.sqlite.prepare('SELECT task_id FROM agentos_runtime_jobs').get().task_id,'winner');
  // Fail after workspace UPDATE: the entire transaction, including revision, rolls back.
  d.insert('rollback');const batch=d.database.batch;
  d.database.batch=async statements=>batch([...statements,d.database.prepare('INSERT INTO missing_table VALUES (?)').bind(1)]);
  await assert.rejects(commitWithJobs(d.database,'rollback',0,before,next));
  assert.equal((await d.read('rollback')).revision,0);assert.equal((await d.read('rollback')).state.tasks.length,0);
  assert.equal((await queueSummary(d.database,'rollback')).pending,0);
});

test('concurrent claims, owner isolation, crash lease expiry and stale acknowledgement fencing',async()=>{
  const d=database(),now=Date.now();d.insert('a');d.insert('b');
  for(const owner of ['a','b'])await commitWithJobs(d.database,owner,0,seed(),await transition(seed(),draft(owner)),now);
  const claims=await Promise.all(Array.from({length:8},()=>claimJob(d.database,'a',now,100)));
  assert.equal(claims.filter(Boolean).length,1);const original=claims.find(Boolean);
  assert.equal(await claimJob(d.database,'a',now+99),null);
  const recovered=await claimJob(d.database,'a',now+100);assert.notEqual(recovered.lease_token,original.lease_token);assert.equal(recovered.attempts,2);
  assert.equal(await acknowledgeJob(d.database,original,await d.read('a'),false,now+101),false);
  assert.equal(await acknowledgeJob(d.database,recovered,await d.read('a'),false,now+101),true);
  assert.equal((await queueSummary(d.database,'b')).pending,1);
});

test('lost response recovers exactly one payment from durable checkpoints, excludes manual tasks',async()=>{
  const d=database();d.insert('a');
  let before=seed(),next=await transition(before,draft('auto'));
  await commitWithJobs(d.database,'a',0,before,next);before=next;next=await transition(before,draft('manual',{executionMode:'manual'}));
  await commitWithJobs(d.database,'a',1,before,next);
  assert.equal((await queueSummary(d.database,'a')).pending,1);
  const store={read:d.read,async execute(owner,command){const snapshot=await d.read(owner),next=await transition(snapshot.state,command);assert.equal(await commitWithJobs(d.database,owner,snapshot.revision,snapshot.state,next),true);return {state:next};}};
  const job=await claimJob(d.database,'a');
  await runTask(store,'a','auto',{delayMs:0,maxTransitions:2}); // consumer dies after reserving.
  const recovered=await claimJob(d.database,'a',Date.now()+120001);
  assert.ok(recovered);assert.equal((await runTask(store,'a','auto',{delayMs:0})).status,'completed');
  // Repeat the operation after another lost response, before acknowledging.
  await runTask(store,'a','auto',{delayMs:0});
  assert.equal(await acknowledgeJob(d.database,recovered,await d.read('a')),true);
  const state=(await d.read('a')).state;
  assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);assert.equal(state.tasks.find(t=>t.id==='manual').step,0);
  assert.equal(await acknowledgeJob(d.database,job,await d.read('a')),false);
});

test('stale workspace acknowledgement cannot swallow a concurrent owner resume; failures back off and dead jobs stop',async()=>{
  const d=database(),now=Date.now();d.insert('a');await commitWithJobs(d.database,'a',0,seed(),await transition(seed(),draft()),now);
  let job=await claimJob(d.database,'a',now),snapshot=await d.read('a');
  const next={...snapshot.state,policy:{...snapshot.state.policy,dailyBudget:snapshot.state.policy.dailyBudget+1}};
  await commitWithJobs(d.database,'a',snapshot.revision,snapshot.state,next,now);
  assert.equal(await acknowledgeJob(d.database,job,snapshot),false);
  assert.equal(await acknowledgeJob(d.database,job,await d.read('a'),true,now),true);
  assert.equal(await claimJob(d.database,'a',now+1999),null);
  job=await claimJob(d.database,'a',now+2000);assert.ok(job);
  d.sqlite.prepare('UPDATE agentos_runtime_jobs SET failures=19 WHERE id=?').run(job.id);job.failures=19;
  await acknowledgeJob(d.database,job,await d.read('a'),true,now+2000);
  assert.equal((await queueSummary(d.database,'a')).dead,1);assert.equal(await claimJob(d.database,'a',now+1e9),null);
});

test('migration backfills automatic legacy work and funded orders without queuing manual work',async()=>{
  const d=database();let state=await transition(seed(),draft('legacy'));state=await transition(state,draft('manual',{executionMode:'manual'}));
  state.chainOrders=[{id:'funded',status:'queued'},{id:'draft',status:'awaiting-funding'}];d.insert('legacy-owner',state);
  const sql=readFileSync('drizzle/0001_chemical_famine.sql','utf8');d.sqlite.exec(sql.slice(sql.indexOf('INSERT OR IGNORE')));
  assert.deepEqual(d.sqlite.prepare('SELECT kind,task_id FROM agentos_runtime_jobs ORDER BY kind').all().map(r=>({...r})),[{kind:'order',task_id:'funded'},{kind:'task',task_id:'legacy'}]);
  assert.equal(d.sqlite.prepare("SELECT id FROM agentos_runtime_jobs WHERE kind='task'").get().id,jobId('legacy-owner','task','legacy'));
});

test('unpaid paused checkpoint sleeps until its deadline instead of losing its expiry job',async()=>{
  const d=database(),now=Date.now();d.insert('a');
  const next=await transition(seed(),draft('paused'),new Date(now).toISOString());next.tasks[0].status='paused';
  await commitWithJobs(d.database,'a',0,seed(),next,now);
  const deadline=Date.parse(next.tasks[0].deadlineAt);
  assert.equal(await claimJob(d.database,'a',deadline-1),null);
  const job=await claimJob(d.database,'a',deadline);assert.ok(job);
  const snapshot=await d.read('a'),expired=await transition(snapshot.state,{type:'expire_task',taskId:'paused'},new Date(deadline).toISOString());
  await commitWithJobs(d.database,'a',snapshot.revision,snapshot.state,expired,deadline);
  await acknowledgeJob(d.database,job,await d.read('a'),false,deadline);
  assert.equal((await queueSummary(d.database,'a')).completed,1);assert.equal((await d.read('a')).state.tasks[0].status,'expired');
});

test('unattended scope fails closed unless explicitly enabled for the exact private origin',()=>{
  assert.throws(()=>drainScope(new Request('https://example.com/api/runtime/drain')),/not configured/);
  assert.throws(()=>drainScope(new Request('https://other.com/api/runtime/drain'),'https://example.com'),/not configured/);
  assert.throws(()=>drainScope(new Request('https://example.com/api/runtime/drain',{headers:{origin:'https://other.com'}}),'https://example.com'),/Cross-origin/);
  assert.throws(()=>drainScope(new Request('https://example.com/api/runtime/drain',{headers:{'x-agentos-sandbox':'test'}}),'https://example.com'),/not configured/);
  assert.equal(drainScope(new Request('https://example.com/api/runtime/drain'),'https://example.com'),undefined);
  assert.equal(drainScope(new Request('http://127.0.0.1/api/runtime/drain',{headers:{'x-agentos-sandbox':'test'}})),'local-demo:sandbox:test');
});
