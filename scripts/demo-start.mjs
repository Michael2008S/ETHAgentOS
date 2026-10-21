import { spawn } from 'node:child_process';
import { mkdir,open,writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { doctor,probe } from './demo-doctor.mjs';
const children=[];let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
const services=[
 ['chain',8545,'http://127.0.0.1:8545/config','chain:local',d=>d.mode==='local'&&d.chainId===31337],
 ['mcp',11439,'http://127.0.0.1:11439/health','mcp:local',d=>d.status==='ok'&&d.chainURL==='http://127.0.0.1:8545'],
 ['plugins',11438,'http://127.0.0.1:11438/health','plugins:local',d=>d.status==='ok'&&d.appOrigin==='http://127.0.0.1:5177'],
 ['model',11435,'http://127.0.0.1:11435/v1/models','model:local',d=>d.data?.some(m=>m.id==='qwen2.5-0.5b-instruct')],
 ['memory',11437,'http://127.0.0.1:11437/v1/models','model:memory',d=>d.data?.some(m=>m.id==='qwen3-embedding-0.6b')],
 ['planning',11436,'http://127.0.0.1:11436/v1/models','model:planning',d=>d.data?.some(m=>m.id==='qwen2.5-3b-instruct')],
 ['supplier2',7462,'http://127.0.0.1:7462/health','supplier:local',d=>d.status==='ok'],
 ['supplier',7461,'http://127.0.0.1:7461/catalog','supplier:local',d=>Array.isArray(d)&&d.length===2],
 ['web',5177,'http://127.0.0.1:5177/api/workspace','dev',d=>!!d.state&&!!d.scope],
];
async function occupied(port){return new Promise(resolve=>{const socket=createConnection({port,host:'127.0.0.1'});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});}
await mkdir('.sites-runtime/demo',{recursive:true});
const lock=await open('.sites-runtime/demo/launcher.lock','wx').catch(()=>{throw new Error('Another demo launcher is active. Inspect its process before removing a stale launcher.lock.');});
try{
 for(const [name,port,url,command,valid] of services){
  if(await probe(url,valid)){console.log('REUSE '+name);continue;}
  if(await occupied(port))throw new Error(`Port ${port} is occupied by an unrecognized/unhealthy service. Inspect it; the launcher will not replace it.`);
  if(name==='web'&&!existsSync('dist/server/wrangler.json'))throw new Error('First installation: run npm ci, npm run build and npm run db:local.');
  const log=await open('.sites-runtime/demo/'+name+'.log','a',0o600);
  const commands={chain:['scripts/local-chain.mjs'],mcp:['scripts/plugins/mcp-fixture.mjs'],plugins:['scripts/plugins/service.mjs'],model:['scripts/model-local.mjs'],planning:['scripts/model-planning-local.mjs'],memory:['scripts/model-memory-local.mjs'],supplier:['scripts/supplier-local.mjs'],supplier2:['scripts/supplier-local.mjs'],web:['scripts/run-framework.mjs','dev','--host','127.0.0.1','--port','5177']};
  const child=spawn(process.execPath,commands[name],{env:{...process.env,...(name==='mcp'?{AGENTOS_CHAIN_URL:'http://127.0.0.1:8545'}:name==='plugins'?{AGENTOS_APP_ORIGIN:'http://127.0.0.1:5177',AGENTOS_MCP_SERVERS:JSON.stringify([{id:'local-chain',url:'http://127.0.0.1:11439/mcp',revision:'1.0.0',readTools:['vault_snapshot']}])}:name==='supplier2'?{AGENTOS_SUPPLIER_PORT:'7462',AGENTOS_SUPPLIER_ID:'local-transfer-supplier-2',AGENTOS_SUPPLIER_NAME:'Second independent transfer supplier',AGENTOS_SUPPLIER_WALLET_ROLE:'seller2',AGENTOS_SUPPLIER_STATE:'.sites-runtime/skill-supplier2'}:name==='supplier'?{AGENTOS_SUPPLIER_PEERS:JSON.stringify(['http://127.0.0.1:7462'])}:{})},stdio:['ignore',log.fd,log.fd]});await log.close();children.push(child);
  let exited=false;child.on('exit',()=>{exited=true;});child.on('error',()=>{exited=true;});
  const deadline=Date.now()+180000;
  while(!await probe(url,valid)){if(exited||stopping||Date.now()>deadline)throw new Error(name+' did not become ready. Inspect .sites-runtime/demo/'+name+'.log; no existing service was reset.');await new Promise(resolve=>setTimeout(resolve,750));}
  console.log('START '+name);
 }
 // Only one launcher owns this worker. Existing independently managed workers are
 // harmless: SQL leases and payment idempotency permit multiple consumers.
 const log=await open('.sites-runtime/demo/worker.log','a',0o600),worker=spawn(process.execPath,['scripts/worker.mjs'],{stdio:['ignore',log.fd,log.fd]});await log.close();children.push(worker);
 worker.on('error',()=>{console.error('Worker failed to start.');stop();process.exitCode=1;});
 worker.on('exit',()=>{if(!stopping){console.error('Worker stopped; restart the launcher after inspecting its log.');stop();process.exitCode=1;}});
 await writeFile('.sites-runtime/demo/launcher.json',JSON.stringify({pid:process.pid,children:children.map(c=>c.pid),startedAt:new Date().toISOString()}));
 const result=await doctor();console.log(JSON.stringify(result,null,2));if(!result.ready)throw new Error('One or more readiness checks failed.');console.log('Demo ready: http://127.0.0.1:5177 ; Ctrl+C stops only processes started here.');
 await new Promise(resolve=>{const timer=setInterval(()=>{if(stopping){clearInterval(timer);resolve();}},250);});
}catch(error){console.error(error.message);stop();process.exitCode=1;}
finally{await lock.close();const {unlink}=await import('node:fs/promises');await unlink('.sites-runtime/demo/launcher.lock').catch(()=>{});}
