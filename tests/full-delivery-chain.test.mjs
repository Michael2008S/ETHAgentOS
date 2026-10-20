import test from 'node:test';
import assert from 'node:assert/strict';
import {startLocalChain} from '../scripts/local-chain.mjs';
import {AgentWalletSession,deliveryBytes} from '../sdk/wallet.ts';
import {seed,transition} from '../lib/agentos/engine.ts';
import {resultHash} from '../cre/workflow/verify.ts';

test('HTTP verifier pays complete reports and refunds forged detail despite unchanged totals and recomputed output hash',async()=>{
 const local=await startLocalChain({port:0});
 const post=async(path,body)=>{const response=await fetch(local.base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
 try{
  const wallet=await AgentWalletSession.connect(local.provider,local.config,false);
  for(const [agentId,tamper] of [['sage',false],['sage',true],['atlas',true]]){
   const taskId=crypto.randomUUID();let state=await transition(seed(),{type:'create_task',taskId,requestId:taskId,agentId,title:'Complete result',budget:1000,scenario:'success',input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'x',to:'alice',cents:100},{block:2,from:'x',to:'bob',cents:200}]}});
   for(let expectedStep=0;expectedStep<6;expectedStep++)state=await transition(state,{type:'advance',taskId,expectedStep});
   const task=state.tasks[0],bytes=deliveryBytes(task,wallet.account),artifact=JSON.parse(bytes.artifactText);
   if(tamper){if(agentId==='sage')artifact.output.allocations={alice:300};else artifact.output.uniqueRecipients=999;artifact.outputHash=resultHash(artifact.output);}
   const spec=await post('/deliveries',{...bytes,artifactText:JSON.stringify(artifact)});
   await wallet.fund(task,spec);
   const verified=await post('/verify',{id:bytes.id}),receipt=await wallet.evidence(task,verified.hash,'settlement',spec);
   assert.equal(verified.accepted,!tamper);assert.equal(receipt.status,tamper?'refunded':'paid');assert.equal(receipt.outputHash,resultHash(artifact));
  }
 }finally{await local.close();}
});
