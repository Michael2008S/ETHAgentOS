import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOSClient } from '../sdk/index.ts';
test('SDK waits for server execution without sending client-side advance commands',async context=>{
  const calls:{url:string;method:string}[]=[];let reads=0;
  context.mock.method(globalThis,'fetch',async(url:string,options:RequestInit)=>{
    calls.push({url,method:options.method!});reads++;
    return Response.json({state:{tasks:[{id:'task',status:reads===1?'running':'completed',receipt:{settlementId:'task:settle'}}]},revision:reads});
  });
  const client=new AgentOSClient('http://localhost');
  const task=await client.run('task',{pollMs:10});assert.equal(task.status,'completed');
  assert.deepEqual(calls.map(c=>c.method),['GET','GET']);
});
test('SDK exposes an owner-scoped POST recovery tick and bounded polling',async context=>{
  let method='';context.mock.method(globalThis,'fetch',async(url:string,options:RequestInit)=>{method=options.method!;return Response.json({state:{tasks:[]},revision:0});});
  const client=new AgentOSClient('http://localhost');await client.recover();assert.equal(method,'POST');
  await assert.rejects(client.run('missing',{pollMs:0}),/interval/);
  await assert.rejects(client.run('missing',{timeoutMs:0}),/Timed out/);
});
