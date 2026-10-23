import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';import{AgentCCIPClient}from'../sdk/ccip.ts';import{ccipTerminal}from'../lib/agentos/ccip-tasks.ts';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:19977';if(new URL(base).hostname!=='127.0.0.1')throw Error('Local CCIP business demo only.');
const sandbox='ccip-'+crypto.randomUUID(),headers={'x-agentos-sandbox':sandbox,'x-agentos-queue-only':'1'},client=new AgentCCIPClient(base,headers),report={sandbox,startedAt:new Date().toISOString(),scope:'local API/D1/queue and persistent dual Mock CCIP chains; separate Vault funds; no real CCIP network',cases:[]};
const draft=(scenario='success')=>({requestId:crypto.randomUUID(),title:'CCIP treasury report '+scenario,budgetCents:100,durationSeconds:600,scenario,approved:true,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury',to:'research',cents:123},{block:2,from:'treasury',to:'operations',cents:456}]}});
try{
 await client.list();const wrong=await fetch(base+'/api/ccip-tasks',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'create',scope:'0x'+'1'.repeat(64),draft:draft()})});assert.equal(wrong.status,403);
 for(const scenario of ['success','invalid-delivery','cancel']){
  const input=draft(scenario==='cancel'?'success':scenario),task=await client.create(input);assert.equal((await client.create(input)).id,task.id);assert.equal(task.reservedCents,100);
  const cross=await fetch(base+'/api/ccip-tasks?id='+task.id,{headers:{'x-agentos-sandbox':'other-'+sandbox}});assert.equal(cross.status,404);
  if(scenario==='cancel')await client.control(task.id,'cancel');
  let done;for(let i=0;i<60;i++){const response=await fetch(base+'/api/runtime/drain',{method:'POST',headers});assert.equal(response.status,200);done=await client.get(task.id);if(ccipTerminal(done))break;await new Promise(r=>setTimeout(r,300));}
  assert.equal(done.status,scenario==='success'?'completed':scenario==='cancel'?'cancelled':'refunded',JSON.stringify(done));assert.equal(done.reservedCents,0);report.cases.push({scenario,id:done.id,status:done.status,evidence:done.evidence,passed:true});console.log('PASS CCIP API/D1/queue '+scenario+' → '+done.status);
 }
 const queue=await(await fetch(base+'/api/runtime/queue',{headers})).json();assert.equal(queue.queue.pending+queue.queue.leased+queue.queue.dead,0);report.queue=queue.queue;report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();const path='outputs/ccip-business-'+crypto.randomUUID()+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Evidence: '+path);}
