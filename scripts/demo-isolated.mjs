import {spawn} from 'node:child_process';
import {mkdir,open,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createConnection} from 'node:net';
import {syncDemoSource} from './demo-source.mjs';
const ports={web:Number(process.env.AGENTOS_DEMO_WEB_PORT||5187),chain:Number(process.env.AGENTOS_DEMO_CHAIN_PORT||8555),supplier:Number(process.env.AGENTOS_DEMO_SUPPLIER_PORT||7471),supplier2:Number(process.env.AGENTOS_DEMO_SUPPLIER_PORT||7471)+1};
if(Object.values(ports).some(n=>!Number.isInteger(n)||n<1024||n>65535)||new Set(Object.values(ports)).size!==Object.values(ports).length)throw new Error('Choose four distinct unprivileged ports.');
const root=resolve('.sites-runtime/isolated-demo/'+crypto.randomUUID()),children=[];
const base='http://127.0.0.1:'+ports.web,chain='http://127.0.0.1:'+ports.chain,supplier='http://127.0.0.1:'+ports.supplier;
// Vinext's CommonJS transform recognizes optimized modules under node_modules/.vite.
// A custom cache outside that directory may be transformed twice.
const env={...process.env,VINEXT_NO_DEV_LOCK:'1',AGENTOS_DEV_STATE_DIRECTORY:root+'/db',AGENTOS_DEV_CACHE_DIRECTORY:resolve('node_modules/.vite/agentos-'+root.split('/').at(-1)),SITES_RUNTIME_ROOT:root,WRANGLER_REGISTRY_PATH:root+'/dev-registry',MINIFLARE_REGISTRY_PATH:root+'/registry',WRANGLER_LOG_PATH:root+'/wrangler/logs',AGENTOS_TEST_URL:base,AGENTOS_CHAIN_URL:chain,AGENTOS_APP_ORIGIN:base,AGENTOS_CHAIN_PORT:String(ports.chain),AGENTOS_SUPPLIER_PORT:String(ports.supplier),AGENTOS_SUPPLIER_STATE:root+'/supplier',VITE_AGENTOS_LOCAL_CHAIN_URL:chain,VITE_AGENTOS_LOCAL_SUPPLIER_URL:supplier};
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');};for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);
const occupied=port=>new Promise(done=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();done(true);});socket.once('error',()=>done(false));});
async function run(name,args,ready,overrides={}){
 const log=await open(root+'/'+name+'.log','a',0o600),child=spawn(process.execPath,args,{env:{...env,...overrides},stdio:['ignore',log.fd,log.fd]});await log.close();children.push(child);
 let terminal=false;const finished=new Promise(done=>{child.once('exit',code=>{terminal=true;done(code);});child.once('error',()=>{terminal=true;done(1);});});
 if(!ready){const code=await finished;if(code!==0)throw new Error(name+' failed; inspect '+root+'/'+name+'.log');return;}
 void finished.then(()=>{if(!stopping){console.error(name+' stopped unexpectedly; inspect '+root+'/'+name+'.log');process.exitCode=1;stop();}});
 const deadline=Date.now()+600000;
 for(;;){if(terminal||stopping||Date.now()>deadline)throw new Error(name+' not ready; inspect '+root+'/'+name+'.log');try{const r=await fetch(ready,{signal:AbortSignal.timeout(3000)}),data=await r.json();if(r.ok&&(name==='web'?typeof data.scope==='string'&&Array.isArray(data.state?.tasks):name==='chain'?data.mode==='local'&&!!data.vault:name.startsWith('supplier')?data.status==='ok':!!data.queue))break;}catch{}await new Promise(done=>setTimeout(done,500));}
 console.log('READY '+name+' '+ready);
}
try{
 for(const port of Object.values(ports))if(await occupied(port))throw new Error('Port '+port+' is already in use; no existing process was changed.');
 await mkdir(root,{recursive:true});
  console.log('SOURCE '+JSON.stringify(await syncDemoSource(root+'/source')));
 await run('database',['scripts/db-local.mjs']);
 await run('chain',['scripts/local-chain.mjs'],chain+'/config');
 await run('supplier2',['scripts/supplier-local.mjs'],'http://127.0.0.1:'+ports.supplier2+'/health',{AGENTOS_SUPPLIER_PORT:String(ports.supplier2),AGENTOS_SUPPLIER_STATE:root+'/supplier2',AGENTOS_SUPPLIER_ID:'local-transfer-supplier-2',AGENTOS_SUPPLIER_NAME:'Second independent transfer supplier',AGENTOS_SUPPLIER_WALLET_ROLE:'seller2'});
 await run('supplier',['scripts/supplier-local.mjs'],supplier+'/health',{AGENTOS_SUPPLIER_PEERS:JSON.stringify(['http://127.0.0.1:'+ports.supplier2])});
 await run('web',['scripts/run-framework.mjs','dev','--host','127.0.0.1','--port',String(ports.web)],base+'/api/workspace');
 await run('worker',['scripts/worker.mjs'],base+'/api/runtime/queue');
 const metadata={root,sourceRoot:process.cwd(),sourceSnapshot:root+'/source',baseURL:base,chainURL:chain,supplierURL:supplier,supplier2URL:'http://127.0.0.1:'+ports.supplier2,identityEnabled:process.env.AGENTOS_DEMO_SKIP_IDENTITY!=='1',startedAt:new Date().toISOString(),pid:process.pid,children:children.map(c=>c.pid)};
 await writeFile(root+'/runtime.json',JSON.stringify(metadata,null,2));await writeFile('.sites-runtime/isolated-demo/current.json',JSON.stringify(metadata,null,2));
 console.log('ISOLATED DEMO '+JSON.stringify(metadata));
 await new Promise(done=>{const timer=setInterval(()=>{if(stopping){clearInterval(timer);done();}},250);});
}catch(error){console.error(error.message);process.exitCode=1;stop();}
