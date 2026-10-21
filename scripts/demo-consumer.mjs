import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {AgentConsumerClient} from '../sdk/consumers.ts';
import {createConsumerClient} from '../lib/agentos/consumer-client.ts';

const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';if(new URL(base).hostname!=='127.0.0.1')throw new Error('Consumer demo requires loopback fault injection.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'consumer-'+id,'x-agentos-queue-only':'1'},other={'x-agentos-sandbox':'consumer-other-'+id,'x-agentos-queue-only':'1'},manager=new AgentConsumerClient(base,headers),report={id,startedAt:new Date().toISOString(),scope:'actual local HTTP/D1 credential-scoped consumer process, outage and restart; no hosted deployment or schedule',cases:[]};
let issued,proxy,worker,mode='healthy',dropDrain=false,drops=0,lastDropAt=0,forwarded=0;const children=[];
async function api(path,body,h=headers,method=body?'POST':'GET'){const response=await fetch(base+path,{method,headers:{...h,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const data=await response.json();assert.equal(response.ok,true,JSON.stringify(data));return data;}
async function state(h=headers){return (await api('/api/workspace',undefined,h)).state;}
async function create(name,h=headers){return api('/api/command',{type:'create_task',taskId:id+'-'+name,requestId:id+'-'+name,agentId:'atlas',title:'Consumer '+name,budget:1000,scenario:'success'},h);}
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Timed out waiting for '+label);}
async function health(w){if(!w.health)return null;try{const response=await fetch(w.health,{signal:AbortSignal.timeout(2000)});return {code:response.status,body:await response.json()};}catch{return null;}}
async function launch(origin){
 const child=spawn(process.execPath,['scripts/consumer.mjs'],{env:{...process.env,AGENTOS_CONSUMER_URL:origin,AGENTOS_CONSUMER_TOKEN:issued.token,AGENTOS_CONSUMER_HEALTH_PORT:'0'},stdio:['ignore','pipe','pipe']}),w={child,health:null,output:'',code:null,terminal:false};children.push(w);
 const finished=new Promise(resolve=>child.once('close',code=>{w.code=code;w.terminal=true;resolve(code);}));w.finished=finished;
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{w.output+=chunk.toString();assert.equal(w.output.includes(issued.token),false);const match=/Consumer health: (http:\/\/127\.0\.0\.1:\d+\/health)/.exec(w.output);if(match)w.health=match[1];});
 await until(()=>w.health||w.terminal,'consumer health listener');assert.equal(w.terminal,false,w.output);return w;
}
try{
 issued=await manager.issue({name:'Isolated recovery consumer',ttlSeconds:3600,intervalMs:1000});assert.equal((await manager.list()).some(c=>c.id===issued.credential.id),true);assert.equal(JSON.stringify(await manager.list()).includes(issued.token),false);
 const serviceHeaders={'x-agentos-consumer-token':issued.token},client=createConsumerClient({origin:base,token:issued.token});
 for(const path of ['/api/workspace','/api/runtime/queue','/api/runtime/consumers'])assert.equal((await fetch(base+path,{headers:serviceHeaders})).status,403);
 assert.equal((await fetch(base+'/api/runtime/drain',{method:'POST',headers:{...serviceHeaders,'Content-Type':'application/json'},body:JSON.stringify({owner:'other'})})).status,400);
 await create('first');await create('other',other);assert.equal((await state()).tasks[0].step,0);
 proxy=createServer(async(request,response)=>{try{
  if(mode==='outage'){response.writeHead(503);return response.end('Simulated unavailable service.');}
  if(!['/api/runtime/drain','/api/runtime/consumer-status'].includes(request.url)){response.writeHead(404);return response.end();}
  forwarded++;const result=await fetch(base+request.url,{method:request.method,headers:serviceHeaders,redirect:'manual',signal:AbortSignal.timeout(30000)}),text=await result.text();
  if(dropDrain&&request.url==='/api/runtime/drain'&&result.ok&&JSON.parse(text).claimed>0){dropDrain=false;drops++;lastDropAt=Date.now();return response.destroy();}
  response.writeHead(result.status,{'Content-Type':'application/json'});response.end(text);
 }catch{response.writeHead(503);response.end('{}');}});await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+proxy.address().port;
 worker=await launch(origin);await until(async()=>(await state()).tasks.find(t=>t.id===id+'-first')?.status==='completed','scoped consumer payment');assert.equal((await state(other)).tasks[0].step,0);assert.equal((await client.status()).queue.completed,1);await until(async()=>(await health(worker))?.code===200,'first verified consumer health');
 report.cases.push({name:'scoped credential consumes authorized work; owner APIs and other workspace remain inaccessible',status:'passed'});
 mode='outage';await until(async()=>(await health(worker))?.code===503,'unavailable consumer health');const beforeForwarded=forwarded;await create('outage');assert.equal((await state()).tasks[0].step,0);mode='healthy';await until(async()=>(await state()).tasks.find(t=>t.id===id+'-outage')?.status==='completed','outage recovery');await until(async()=>(await health(worker))?.code===200,'recovered health');assert.ok(forwarded>beforeForwarded);
 report.cases.push({name:'transport outage is visible and queued work recovers automatically',status:'passed'});
 dropDrain=true;await create('lost-response');await until(()=>drops===1,'dropped response after committed work');await until(async()=>{const h=await health(worker);return h?.code===200&&Date.parse(h.body.lastSuccessAt)>lastDropAt;},'verified successful read after lost response retry');assert.equal((await state()).ledger.filter(l=>l.taskId===id+'-lost-response'&&l.kind==='settle').length,1);
 report.cases.push({name:'lost drain response retries without a second payment',status:'passed'});
 worker.child.kill('SIGKILL');await worker.finished;await create('restart');assert.equal((await state()).tasks[0].step,0);worker=await launch(origin);await until(async()=>(await state()).tasks.find(t=>t.id===id+'-restart')?.status==='completed','process restart');assert.equal((await state()).ledger.filter(l=>l.kind==='settle').length,4);
 report.cases.push({name:'consumer process restart retains queued work and prior payments',status:'passed'});
 await manager.revoke(issued.credential.id);await until(()=>worker.terminal,'revoked consumer exit');assert.equal(worker.code,2);await assert.rejects(client.status(),/authentication/);assert.equal((await state(other)).tasks[0].step,0);
 report.cases.push({name:'revocation terminates the consumer without altering paid receipts',status:'passed'});
 report.queue=(await api('/api/runtime/queue')).queue;report.otherQueue=(await api('/api/runtime/queue',undefined,other)).queue;report.credential={...issued.credential,revoked:true};report.status='passed';for(const entry of report.cases)console.log('PASS '+entry.name);
}catch(error){report.status='failed';report.error=String(error.message).split(issued?.token??'\u0000').join('[redacted]');console.error(report.error);process.exitCode=1;}
finally{for(const w of children)if(!w.terminal){w.child.kill('SIGTERM');await w.finished;}if(proxy)await new Promise(resolve=>{proxy.close(resolve);proxy.closeAllConnections();});if(issued)await manager.revoke(issued.credential.id).catch(()=>{});report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/consumer-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Consumer acceptance evidence: '+path);}
