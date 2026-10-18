import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Deadline demo requires a loopback server.');
const id=crypto.randomUUID(), headers={'Content-Type':'application/json','x-agentos-sandbox':'deadline-'+id};
async function request(path, body){
  const r=await fetch(base+path,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await r.json(); assert.equal(r.ok,true,JSON.stringify(data)); return data.state;
}
const command=body=>request('/api/command',body);
const cases=[];
async function create(name, scenario='success', automatic=false){
  const taskId=id+'-'+name;
  const s=await command({type:'create_task',taskId,requestId:taskId,agentId:'atlas',title:'Deadline demo: '+name,budget:1000,scenario,timeoutSeconds:automatic?2:30,...(!automatic?{executionMode:'manual'}:{})});
  return s.tasks.find(t=>t.id===taskId);
}

const automatic=await create('automatic','success',true);
const reserved=await create('reserved');
for(const expectedStep of [0,1])await command({type:'advance',taskId:reserved.id,expectedStep});
const paid=await create('paid-recovery','interruption');
for(const expectedStep of [0,1,2,3,4])await command({type:'advance',taskId:paid.id,expectedStep});
let state=await request('/api/workspace');
assert.equal(state.tasks.find(t=>t.id===reserved.id).reserved,1000);
const originalReceipt=state.tasks.find(t=>t.id===paid.id).receipt;
assert.ok(originalReceipt); assert.equal(state.tasks.find(t=>t.id===paid.id).status,'paused');
console.log('Reserved funds and committed payment confirmed. Waiting for server deadlines.');
await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(paid.deadlineAt)-Date.now()+100)));

state=await request('/api/workspace');
assert.equal(state.tasks.find(t=>t.id===automatic.id).status,'expired');
assert.equal(state.tasks.find(t=>t.id===automatic.id).paid,0);
cases.push({name:'automatic background expiry without polling',passed:true});
await Promise.all(Array.from({length:5},()=>command({type:'expire_task',taskId:reserved.id})));
state=await command({type:'advance',taskId:reserved.id,expectedStep:2});
assert.equal(state.tasks.find(t=>t.id===reserved.id).status,'expired');
assert.equal(state.tasks.find(t=>t.id===reserved.id).reserved,0);
assert.equal(state.ledger.filter(l=>l.taskId===reserved.id&&l.kind==='release').length,1);
assert.equal(state.tasks.find(t=>t.id===reserved.id).paid,0);
cases.push({name:'reserved checkpoint expires once under concurrent retries',passed:true});
await command({type:'expire_task',taskId:paid.id});
await command({type:'resume_task',taskId:paid.id});
state=await command({type:'advance',taskId:paid.id,expectedStep:5});
assert.equal(state.tasks.find(t=>t.id===paid.id).status,'completed');
assert.deepEqual(state.tasks.find(t=>t.id===paid.id).receipt,originalReceipt);
assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);
assert.equal(state.tasks.reduce((sum,t)=>sum+t.reserved,0),0);
cases.push({name:'paid checkpoint recovers after deadline without another payment',passed:true});
mkdirSync('outputs',{recursive:true});
const report='outputs/deadline-demo-'+id+'.json';
writeFileSync(report,JSON.stringify({at:new Date().toISOString(),base,cases,state},null,2));
console.log('Deadline demo PASS: '+cases.length+' cases; '+report);
