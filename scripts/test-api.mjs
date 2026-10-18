import assert from 'node:assert/strict';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('API test is restricted to loopback development servers.');
// The trusted local gateway still owns identity; this namespace isolates test records.
const headers={'Content-Type':'application/json','x-agentos-sandbox':'api-'+crypto.randomUUID()};
async function command(body){const r=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data.state;}
async function read(){const r=await fetch(base+'/api/workspace',{headers});assert.equal(r.status,200);return(await r.json()).state;}
const initial=await read(); const runId=crypto.randomUUID();
const settledToday=initial.ledger.filter(l=>l.kind==='settle'&&l.at.slice(0,10)===new Date().toISOString().slice(0,10)).reduce((n,l)=>n+l.amount,0);
if(initial.tasks.some(t=>['queued','running'].includes(t.status)))throw new Error('Finish active demo tasks and close other preview tabs before API tests.');
try {
await command({type:'update_policy',policy:{...initial.policy,maxTaskBudget:10000,dailyBudget:settledToday+10000}});
const ids=['api-'+runId+'-a','api-'+runId+'-b'];await Promise.all(ids.map(id=>command({type:'create_task',executionMode:'manual',requestId:id,taskId:id,agentId:'atlas',title:'Concurrent reservation '+id,budget:6000,scenario:'success'})));
await Promise.all(ids.map(taskId=>command({type:'advance',taskId,expectedStep:0})));
await Promise.all(ids.map(taskId=>command({type:'advance',taskId,expectedStep:1})));
let s=await read();assert.equal(s.tasks.filter(t=>ids.includes(t.id)&&t.reserved===6000).length,1);assert.equal(s.tasks.filter(t=>ids.includes(t.id)&&t.status==='blocked').length,1);
const task=s.tasks.find(t=>ids.includes(t.id)&&t.reserved>0);
for(const expectedStep of [2,3,4,5])await Promise.all(Array.from({length:5},()=>command({type:'advance',taskId:task.id,expectedStep})));
s=await read();assert.equal(s.ledger.filter(l=>l.kind==='settle'&&l.taskId===task.id).length,1);assert.equal(s.tasks.find(t=>t.id===task.id).paid,240);
const revokedId='api-'+runId+'-revoked';
await command({type:'create_task',executionMode:'manual',requestId:revokedId,taskId:revokedId,agentId:'atlas',title:'Revoke after reserve',budget:1000,scenario:'success'});
for(const expectedStep of [0,1])s=await command({type:'advance',taskId:revokedId,expectedStep});
assert.equal(s.tasks.find(t=>t.id===revokedId).reserved,1000);
await command({type:'update_policy',policy:{...s.policy,active:false}});
s=await command({type:'advance',taskId:revokedId,expectedStep:2});
assert.equal(s.tasks.find(t=>t.id===revokedId).status,'blocked');assert.equal(s.tasks.find(t=>t.id===revokedId).reserved,0);assert.equal(s.tasks.find(t=>t.id===revokedId).paid,0);
const receipt=await fetch(base+'/api/receipts/'+task.id,{headers});assert.equal(receipt.status,200);assert.equal((await receipt.json()).integrityValid,true);
const exported=await fetch(base+'/api/exports?kind=receipt&taskId='+encodeURIComponent(task.id),{headers});assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/^attachment; filename=/);assert.deepEqual(await exported.json(),s.tasks.find(t=>t.id===task.id).receipt);
const crossOwner=await fetch(base+'/api/exports?kind=receipt&taskId='+encodeURIComponent(task.id),{headers:{...headers,'x-agentos-sandbox':'other-'+runId}});assert.equal(crossOwner.status,404);
await command({type:'update_policy',policy:initial.policy});
const serviceId='api-'+runId+'-service';
s=await command({type:'create_task',executionMode:'manual',requestId:serviceId,taskId:serviceId,agentId:'relay',title:'Accepted quote survives price change',budget:1000,scenario:'success'});
await command({type:'update_agent',agentId:'relay',enabled:true,price:400});
for(const expectedStep of [0,1])s=await command({type:'advance',taskId:serviceId,expectedStep});
assert.equal(s.tasks.find(t=>t.id===serviceId).quote,180);assert.equal(s.tasks.find(t=>t.id===serviceId).reserved,1000);
s=await command({type:'update_agent',agentId:'relay',enabled:false,price:400});
assert.equal(s.tasks.find(t=>t.id===serviceId).status,'blocked');assert.equal(s.tasks.find(t=>t.id===serviceId).reserved,0);
const unavailable=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify({type:'create_task',requestId:serviceId+'-denied',taskId:serviceId+'-denied',agentId:'relay',title:'Disabled service',budget:1000,scenario:'success'})});assert.equal(unavailable.status,400);
await command({type:'update_agent',agentId:'relay',enabled:true,price:400});
s=await command({type:'create_task',executionMode:'manual',requestId:serviceId+'-new',taskId:serviceId+'-new',agentId:'relay',title:'New quote',budget:1000,scenario:'success'});
assert.equal(s.tasks.find(t=>t.id===serviceId+'-new').quote,400);
await command({type:'cancel_task',taskId:serviceId+'-new'});
const denied=await fetch(base+'/api/command',{method:'POST',headers:{...headers,Origin:'https://different.example'},body:JSON.stringify({type:'topup',amount:1,requestId:'csrf'})});assert.equal(denied.status,403);
const invalid=await fetch(base+'/api/command',{method:'POST',headers,body:'{broken'});assert.equal(invalid.status,400);
console.log('API integration PASS: D1 CAS concurrency, duplicate settlement, revoke after reservation, owner-scoped exports, service availability and quote snapshots, origin guard, invalid input.');

} finally { await command({type:'update_policy',policy:initial.policy}); }
