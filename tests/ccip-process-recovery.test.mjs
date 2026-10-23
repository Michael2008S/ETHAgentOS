import test from 'node:test';import assert from 'node:assert/strict';import{spawn}from'node:child_process';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{createPublicClient,http}from'viem';
import{createCCIPTask,runCCIPTask,ccipJob,ccipTerminal}from'../lib/agentos/ccip-tasks.ts';import{localCCIPTransport}from'../lib/agentos/ccip-runtime.ts';import{ccipWorkspace,ccipDraft}from'./ccip-business-fixture.mjs';import{escrowABI}from'../sdk/chain.ts';
async function start(root,port=0){
 const code="import{startCCIPService}from'./scripts/ccip/service.mjs';let s;s=await startCCIPService({root:process.argv[1],port:Number(process.argv[2]),appOrigin:'http://127.0.0.1:12345',faults:{afterSettlement:async()=>{if(!s.store.get('crash','consumed')){s.store.put('crash','consumed',true);process.kill(process.pid,'SIGKILL');}}}});console.log('READY '+s.base);process.on('SIGTERM',async()=>{await s.close();});";
 const child=spawn(process.execPath,['--input-type=module','-e',code,root,String(port)],{stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',b=>{output=(output+b).slice(-2000);});const done=new Promise(resolve=>child.once('close',resolve));
 const base=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',b=>{text+=b;const m=text.match(/READY (http:\/\/127\.0\.0\.1:\d+)/);if(m)resolve(m[1]);});child.once('error',reject);child.once('close',()=>reject(Error(output)));});return{child,done,base};
}
async function stop(process){if(!process)return;if(process.child.exitCode===null&&process.child.signalCode===null)process.child.kill('SIGTERM');await process.done;}
test('SIGKILL after B settlement restarts both EVM databases and D1 without a second escrow or payout',async()=>{
 const root=await mkdtemp(tmpdir()+'/agentos-ccip-kill-');let process,store;try{
  store=ccipWorkspace(root+'/d1.sqlite');process=await start(root+'/runtime');const deployment=await(await fetch(process.base+'/config')).json(),created=await createCCIPTask(store,'owner',ccipDraft(),async()=>deployment),transport=()=>localCCIPTransport(process.base);
  for(let i=0;i<12&&process.child.signalCode===null;i++)await runCCIPTask(store,'owner',created.id,transport);
  await process.done;assert.equal(process.child.signalCode,'SIGKILL');assert.equal(ccipJob((await store.read('owner')).state,created.id).reservedCents,100);
  const port=Number(new URL(process.base).port);store.close();store=ccipWorkspace(root+'/d1.sqlite');process=await start(root+'/runtime',port);assert.deepEqual(await(await fetch(process.base+'/config')).json(),deployment);
  for(let i=0;i<12&&!ccipTerminal(ccipJob((await store.read('owner')).state,created.id));i++)await runCCIPTask(store,'owner',created.id,transport);
  const done=ccipJob((await store.read('owner')).state,created.id);assert.equal(done.status,'completed');assert.equal(done.reservedCents,0);assert.equal(done.evidence.bReserved,'0');
  const client=createPublicClient({transport:http(process.base+'/chain/b')});assert.equal((await client.getContractEvents({address:deployment.b.escrow,abi:escrowABI,eventName:'Opened',fromBlock:0n})).length,1);assert.equal((await client.getContractEvents({address:deployment.b.escrow,abi:escrowABI,eventName:'Settled',fromBlock:0n})).length,1);
 }finally{await stop(process);store?.close();await rm(root,{recursive:true,force:true});}
});
