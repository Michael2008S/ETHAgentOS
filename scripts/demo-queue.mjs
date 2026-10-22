import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { AgentWalletSession,localWalletProvider,inputEvidence } from '../sdk/wallet.ts';
import { AgentOrderClient } from '../sdk/orders.ts';
import { escrowABI } from '../sdk/chain.ts';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Queue fault injection is restricted to loopback.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'queue-'+id,'x-agentos-queue-only':'1'},report={id,startedAt:new Date().toISOString(),mode:'actual D1 durable queue + independent HTTP consumer + local Qwen/EVM',cases:[]};
async function api(path,body,h=headers,method=body?'POST':'GET') {
  const response=await fetch(base+path,{method,headers:{...h,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
  const data=await response.json();assert.equal(response.ok,true,JSON.stringify(data));return data;
}
const command=body=>api('/api/command',body),read=async()=> (await api('/api/workspace')).state,drain=()=>api('/api/runtime/drain',undefined,headers,'POST');
const create=(name,extra={})=>command({type:'create_task',requestId:id+'-'+name,taskId:id+'-'+name,agentId:'atlas',title:'Queue '+name,budget:1000,scenario:'success',...extra});
const passed=(name,data)=>{report.cases.push({name,...data,passed:true});console.log('PASS '+name);};
try {
  await create('success');await create('manual',{executionMode:'manual'});
  let state=await read();assert.equal(state.tasks.find(t=>t.id===id+'-success').step,0);assert.equal((await api('/api/runtime/queue')).queue.pending,1);
  const observerHeaders={'x-agentos-sandbox':headers['x-agentos-sandbox']};
  // Exercise the old read scheduler's four-second stale threshold, too.
  await new Promise(resolve=>setTimeout(resolve,4200));
  await Promise.all(Array.from({length:3},()=>api('/api/workspace',undefined,observerHeaders)));
  await new Promise(resolve=>setTimeout(resolve,1200));
  state=await read();assert.equal(state.tasks.find(t=>t.id===id+'-success').step,0,'Ordinary workspace GET must not advance a queued task.');assert.equal((await api('/api/runtime/queue')).queue.pending,1);
  passed('ordinary workspace reads do not execute tasks or claim durable jobs',{step:0,queue:(await api('/api/runtime/queue')).queue});
  const other={'x-agentos-sandbox':'other-queue-'+id,'x-agentos-queue-only':'1'};
  assert.equal((await api('/api/runtime/queue',undefined,other)).queue.pending,0);assert.equal((await api('/api/runtime/drain',undefined,other,'POST')).claimed,0);
  assert.equal((await read()).tasks.find(t=>t.id===id+'-success').step,0);
  // No open browser/GET recovery/inline after task: only this separate consumer progresses.
  const concurrent=await Promise.all(Array.from({length:5},drain));state=await read();
  assert.equal(concurrent.reduce((n,r)=>n+r.claimed,0),1);assert.equal(state.tasks.find(t=>t.id===id+'-success').status,'completed');assert.equal(state.tasks.find(t=>t.id===id+'-manual').step,0);
  assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);await drain();assert.equal((await read()).ledger.filter(l=>l.kind==='settle').length,1);
  passed('request continuation lost; independent concurrent consumer pays once and preserves manual/owner isolation',{concurrent,queue:(await api('/api/runtime/queue')).queue});

  await create('revoked');await command({type:'update_policy',policy:{...state.policy,active:false}});await drain();state=await read();
  const revoked=state.tasks.find(t=>t.id===id+'-revoked');assert.equal(revoked.status,'blocked');assert.equal(revoked.paid,0);assert.equal(revoked.reserved,0);
  await command({type:'update_policy',policy:{...state.policy,active:true}});passed('consumer rechecks current owner permission',{task:revoked});

  await create('expired',{timeoutSeconds:1});await new Promise(resolve=>setTimeout(resolve,1100));await drain();
  const expired=(await read()).tasks.find(t=>t.id===id+'-expired');assert.equal(expired.status,'expired');assert.equal(expired.paid,0);passed('unattended overdue task expires without payment',{task:expired});

  await create('invalid',{scenario:'invalid-delivery'});await create('injection',{scenario:'injection'});await drain();state=await read();
  assert.equal(state.tasks.find(t=>t.id===id+'-invalid').status,'refunded');assert.equal(state.tasks.find(t=>t.id===id+'-injection').status,'blocked');
  assert.equal(state.ledger.filter(l=>l.kind==='settle').length,1);passed('invalid delivery and unauthorized tool still cannot pay',{queue:(await api('/api/runtime/queue')).queue});

  const local=(process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545'),config=await (await fetch(local+'/config')).json();
  const session=await AgentWalletSession.connect(localWalletProvider(local),config,false),os=new AgentOrderClient(session,base,headers),ledger=structuredClone((await read()).ledger);
  const order=await os.create({requestId:crypto.randomUUID(),agentId:'atlas',title:'Queue recovery with real model',budget:1000,planner:'llm',input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'a.eth',to:'b.eth',cents:123},{block:2,from:'a.eth',to:'c.eth',cents:456}]}});
  const beforeFunding=await api('/api/runtime/queue');await drain();assert.equal((await os.orders()).find(o=>o.id===order.id).status,'awaiting-funding');
  const funding=await session.fundOrder(order,180);await os.activate(order,funding);
  let current=(await os.orders()).find(o=>o.id===order.id);assert.equal(current.status,'queued');assert.equal(current.modelPlan,undefined);assert.equal(current.output,null);
  await Promise.all(Array.from({length:3},()=>api('/api/workspace',undefined,observerHeaders)));await new Promise(resolve=>setTimeout(resolve,1200));
  current=(await os.orders()).find(o=>o.id===order.id);assert.equal(current.status,'queued','Ordinary workspace GET must not execute a funded order.');assert.equal(current.modelPlan,undefined);assert.equal(current.output,null);
  const ticks=[];
  for(let i=0;i<12&&!['completed','refunded','paused'].includes(current.status);i++) {
    ticks.push(await drain());current=(await os.orders()).find(o=>o.id===order.id);
    if(!['completed','refunded','paused'].includes(current.status))await new Promise(resolve=>setTimeout(resolve,1100));
  }
  assert.equal(current.status,'completed',current.lastError??'Funded model order did not complete through the durable queue');assert.equal(current.settlement.status,'paid');assert.equal(current.output.totalCents,579);assert.ok(current.modelPlan.usage.completionTokens>0);
  await Promise.all(Array.from({length:4},drain));
  const logs=await session.client.getContractEvents({address:config.escrow,abi:escrowABI,eventName:'Settled',args:{id:inputEvidence(order,session.account).id},fromBlock:BigInt(funding.blockNumber)});assert.equal(logs.length,1);
  assert.deepEqual((await read()).ledger,ledger);passed('draft excluded; funded model order recovers through multiple queue ticks, one EVM payment',{beforeFunding:beforeFunding.queue,ticks,order:current,settledEvents:logs.length});
  await command({type:'cancel_task',taskId:id+'-manual'});report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);console.error(report.error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/queue-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Queue evidence: '+path);}
