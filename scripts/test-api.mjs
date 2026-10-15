import assert from 'node:assert/strict';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('API test is restricted to loopback development servers.');
const headers={'Content-Type':'application/json'};
async function command(body){const r=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data.state;}
async function read(){const r=await fetch(base+'/api/workspace',{headers});assert.equal(r.status,200);return(await r.json()).state;}
const initial=await read(); const runId=crypto.randomUUID();
const settledToday=initial.ledger.filter(l=>l.kind==='settle'&&l.at.slice(0,10)===new Date().toISOString().slice(0,10)).reduce((n,l)=>n+l.amount,0);
if(initial.tasks.some(t=>['queued','running'].includes(t.status)))throw new Error('Finish active demo tasks and close other preview tabs before API tests.');
try {
await command({type:'update_policy',policy:{...initial.policy,maxTaskBudget:10000,dailyBudget:settledToday+10000}});
const ids=['api-'+runId+'-a','api-'+runId+'-b'];await Promise.all(ids.map(id=>command({type:'create_task',requestId:id,taskId:id,agentId:'atlas',title:'Concurrent reservation '+id,budget:6000,scenario:'success'})));
await Promise.all(ids.map(taskId=>command({type:'advance',taskId,expectedStep:0})));
await Promise.all(ids.map(taskId=>command({type:'advance',taskId,expectedStep:1})));
let s=await read();assert.equal(s.tasks.filter(t=>ids.includes(t.id)&&t.reserved===6000).length,1);assert.equal(s.tasks.filter(t=>ids.includes(t.id)&&t.status==='blocked').length,1);
const task=s.tasks.find(t=>ids.includes(t.id)&&t.reserved>0);
for(const expectedStep of [2,3,4,5])await Promise.all(Array.from({length:5},()=>command({type:'advance',taskId:task.id,expectedStep})));
s=await read();assert.equal(s.ledger.filter(l=>l.kind==='settle'&&l.taskId===task.id).length,1);assert.equal(s.tasks.find(t=>t.id===task.id).paid,240);
const receipt=await fetch(base+'/api/receipts/'+task.id,{headers});assert.equal(receipt.status,200);assert.equal((await receipt.json()).integrityValid,true);
const denied=await fetch(base+'/api/command',{method:'POST',headers:{...headers,Origin:'https://different.example'},body:JSON.stringify({type:'topup',amount:1,requestId:'csrf'})});assert.equal(denied.status,403);
const invalid=await fetch(base+'/api/command',{method:'POST',headers,body:'{broken'});assert.equal(invalid.status,400);
console.log('API integration PASS: D1 CAS concurrency, duplicate settlement, receipt integrity, origin guard, invalid input.');

} finally { await command({type:'update_policy',policy:initial.policy}); }
