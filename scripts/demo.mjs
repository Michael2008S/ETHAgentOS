import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Demo checks require a loopback URL.');
const sandbox='demo-'+crypto.randomUUID();
const headers={'Content-Type':'application/json','x-agentos-sandbox':sandbox};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={version:1,startedAt:new Date().toISOString(),base,sandbox,cases:[]};
async function request(path,body,customHeaders=headers){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:customHeaders,...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new Error(`${response.status}: ${data.error}`);return data;
}
const read=async()=>(await request('/api/workspace')).state;
const send=async command=>(await request('/api/command',command)).state;
let counter=0;
const create=(scenario='success',extra={})=>{const taskId=`${sandbox}-${++counter}`;return {type:'create_task',taskId,requestId:taskId,title:`Headless demo: ${scenario}`,agentId:'atlas',budget:1000,scenario,...extra};};
async function waitFor(taskId,expected){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){const state=await read();const task=state.tasks.find(t=>t.id===taskId);if(task&&expected(task))return {task,state};await sleep(50);}
  throw new Error(`Task ${taskId} did not reach expected state`);
}
async function check(name,fn){const started=Date.now();await fn();report.cases.push({name,status:'passed',durationMs:Date.now()-started});console.log(`PASS ${name}`);}
try {
  assert.equal((await read()).tasks.length,0);
  await check('success completes on server after create response, without browser or advance calls',async()=>{
    const command=create();await send(command);await sleep(5200);
    const state=await read(),task=state.tasks.find(t=>t.id===command.taskId);
    assert.equal(task.status,'completed');assert.equal(task.paid,240);assert.equal(task.reserved,0);assert.equal(task.output.totalCents,75000);
    const receipt=await request('/api/receipts/'+task.id);assert.equal(receipt.integrityValid,true);
    assert.equal(receipt.receipt.digest,task.receipt.digest);
  });
  for(const [scenario,status]of [['injection','blocked'],['invalid-delivery','refunded']])await check(scenario+' pays nothing and releases funds',async()=>{
    const command=create(scenario);await send(command);const {task}=await waitFor(command.taskId,t=>t.status===status);assert.equal(task.paid,0);assert.equal(task.reserved,0);
  });
  await check('interruption survives persistence and resumes with one payment',async()=>{
    const command=create('interruption');await send(command);const paused=await waitFor(command.taskId,t=>t.status==='paused');assert.equal(paused.task.paid,240);
    const before=paused.task.receipt.digest;
    await Promise.all(Array.from({length:3},()=>send({type:'resume_task',taskId:command.taskId})));
    const {task,state}=await waitFor(command.taskId,t=>t.status==='completed');assert.equal(task.receipt.digest,before);assert.equal(state.ledger.filter(l=>l.kind==='settle'&&l.taskId===task.id).length,1);
  });
  await check('permission revocation blocks an automatically executing task',async()=>{
    const command=create();const created=await send(command);
    await send({type:'update_policy',policy:{...created.policy,active:false}});
    const {task,state}=await waitFor(command.taskId,t=>t.status==='blocked');assert.equal(task.paid,0);assert.equal(task.reserved,0);
    await send({type:'update_policy',policy:{...state.policy,active:true}});
  });
  await check('cancellation stops background worker and releases funds',async()=>{
    const command=create();await send(command);await send({type:'cancel_task',taskId:command.taskId});await sleep(500);
    const {task}=await waitFor(command.taskId,t=>t.status==='cancelled');assert.equal(task.paid,0);assert.equal(task.reserved,0);
  });
  await check('concurrent duplicate creates settle once',async()=>{
    const command=create();await Promise.all(Array.from({length:5},()=>send(command)));
    const {state}=await waitFor(command.taskId,t=>t.status==='completed');assert.equal(state.tasks.filter(t=>t.id===command.taskId).length,1);assert.equal(state.ledger.filter(l=>l.kind==='settle'&&l.taskId===command.taskId).length,1);
    const response=await fetch(base+'/api/command',{method:'POST',headers,body:JSON.stringify({...command,budget:1001})});assert.equal(response.status,409);
  });
  await check('test workspace is isolated and all terminal reservations are zero',async()=>{
    const other=await request('/api/workspace',undefined,{...headers,'x-agentos-sandbox':sandbox+'-other'});assert.equal(other.state.tasks.length,0);
    const state=await read();assert.equal(state.tasks.length,7);assert.equal(state.tasks.reduce((sum,t)=>sum+t.reserved,0),0);
    assert.equal(state.ledger.filter(l=>l.kind==='settle').reduce((sum,l)=>sum+l.amount,0),720);
    report.final={taskCount:state.tasks.length,settledCents:720,reservedCents:0};
  });
  report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.error(report.error);}
report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});
const path=`outputs/${sandbox}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log('Demo evidence: '+path);
