import {test} from 'node:test';import assert from 'node:assert/strict';
import {processRows,cleanupPlan,applyCleanup} from '../scripts/demo-cleanup.mjs';
const root='/repo/agent-os',row=(pid,ppid,command,cwd=root)=>({pid,ppid,command,cwd,rssKB:1024,started:'Thu Oct 22 08:00:00 2026'});
test('cleanup keeps the current runtime and model by default, and refuses editor or foreign Node roots',()=>{
 const rows=[row(10,1,'node scripts/demo-isolated.mjs'),row(11,10,'node scripts/worker.mjs'),row(20,1,'node scripts/demo-isolated.mjs'),row(21,20,'/repo/node_modules/workerd serve'),row(30,1,'node scripts/model-memory-local.mjs'),row(31,30,'/repo/llama-server --model weights'),row(40,1,'node scripts/demo-isolated.mjs','/other/repo'),row(50,1,'/Applications/Codex/node helper.js'),row(60,1,'node arbitrary.js')];
 const p=cleanupPlan(rows,{root,currentPID:10});assert.deepEqual(p.targets.map(t=>t.pid),[20,21]);assert.equal(p.estimatedRSSMiB,2);
 const models=cleanupPlan(rows,{root,currentPID:10,models:true});assert.deepEqual(models.targets.map(t=>t.pid),[20,21,30,31]);
 const all=cleanupPlan(rows,{root,currentPID:10,all:true,models:true});assert.deepEqual(all.targets.map(t=>t.pid),[10,11,20,21,30,31]);
 assert.throws(()=>cleanupPlan([...rows,row(99,1,'node node_modules/@playwright/test/cli.js test')],{root,currentPID:10}),/Validation is active/);
});
test('cleanup rechecks command/start time and signals only captured owned descendants',async()=>{
 const rows=[row(20,1,'node scripts/demo-isolated.mjs'),row(21,20,'workerd serve'),row(22,20,'worker thread')],plan=cleanupPlan(rows,{root,currentPID:10}),signals=[];
 let live=rows.map(p=>({...p}));live[2].started='Thu Oct 22 09:00:00 2026';
 const report=await applyCleanup(plan,{snapshot:async()=>live,signal:pid=>{signals.push(pid);live=live.filter(p=>p.pid!==pid);},wait:async()=>{}});
 assert.deepEqual(signals,[20,21]);assert.deepEqual(report.remaining,[]);assert.deepEqual(report.changedPIDs,[22]);assert.equal(report.stopped,2);assert.equal(live[0].pid,22);
});
test('ps parsing preserves a start-time fingerprint and does not interpret non-process lines',()=>{
 const parsed=processRows(' 42 1 2048 Thu Oct 22 08:00:00 2026 node scripts/worker.mjs\ninvalid');assert.equal(parsed.length,1);assert.equal(parsed[0].rssKB,2048);assert.equal(parsed[0].command,'node scripts/worker.mjs');
});
