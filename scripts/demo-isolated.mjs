import {spawn} from 'node:child_process';
import {mkdir,open,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createConnection} from 'node:net';
import {syncDemoSource,verifyDemoSource} from './demo-source.mjs';
const resumeAt=process.argv.indexOf('--resume'),previous=resumeAt>=0?JSON.parse(await readFile(resolve(process.argv[resumeAt+1]),'utf8')):undefined;
if(previous&&!previous.persistent)throw Error('This older runtime is in-memory. Start a new persistent instance; its running chain was not changed.');
const sourceProxy=previous?.sourceProxy??process.env.AGENTOS_DEMO_SOURCE_PROXY==='1';
const capturedSource=previous?.capturedSource??process.env.AGENTOS_DEMO_CAPTURED_SOURCE==='1';
const ports={web:Number(process.env.AGENTOS_DEMO_WEB_PORT||5187),chain:Number(process.env.AGENTOS_DEMO_CHAIN_PORT||8555),supplier:Number(process.env.AGENTOS_DEMO_SUPPLIER_PORT||7471),supplier2:Number(process.env.AGENTOS_DEMO_SUPPLIER_PORT||7471)+1};
ports.plugin=Number(process.env.AGENTOS_DEMO_PLUGIN_PORT||ports.web+1);ports.mcp=Number(process.env.AGENTOS_DEMO_MCP_PORT||ports.web+2);if(capturedSource||sourceProxy)ports.data=Number((previous?.sourceProxyURL||previous?.replayURL)?new URL(previous.sourceProxyURL||previous.replayURL).port:ports.web+3);
if(sourceProxy&&capturedSource)ports.capture=ports.data+1;
if(previous)for(const [key,field]of Object.entries({web:'baseURL',chain:'chainURL',supplier:'supplierURL',supplier2:'supplier2URL',plugin:'pluginURL',mcp:'mcpURL'}))ports[key]=Number(new URL(previous[field]).port);
if(Object.values(ports).some(n=>!Number.isInteger(n)||n<1024||n>65535)||new Set(Object.values(ports)).size!==Object.values(ports).length)throw new Error('Choose six distinct unprivileged ports.');
const root=previous?resolve(previous.root):resolve('.sites-runtime/isolated-demo/'+crypto.randomUUID()),children=[];
const pluginURL='http://127.0.0.1:'+ports.plugin,mcpURL='http://127.0.0.1:'+ports.mcp;
const base='http://127.0.0.1:'+ports.web,chain='http://127.0.0.1:'+ports.chain,supplier='http://127.0.0.1:'+ports.supplier;
// Vinext's CommonJS transform recognizes optimized modules under node_modules/.vite.
// A custom cache outside that directory may be transformed twice.
const env={...process.env,...(capturedSource?{AGENTOS_REPLAY_PORT:String(ports.capture??ports.data),VITE_AGENTOS_CAPTURED_DATA_URL:'http://127.0.0.1:'+ports.data+'/captured-usdc'}:{}),...(sourceProxy&&!capturedSource?{VITE_AGENTOS_LIVE_DATA_URL:'http://127.0.0.1:'+ports.data+'/live-usdc'}:{}),VINEXT_NO_DEV_LOCK:'1',AGENTOS_DEV_STATE_DIRECTORY:root+'/db',AGENTOS_DEV_CACHE_DIRECTORY:resolve('node_modules/.vite/agentos-'+root.split('/').at(-1)),SITES_RUNTIME_ROOT:root,WRANGLER_REGISTRY_PATH:root+'/dev-registry',MINIFLARE_REGISTRY_PATH:root+'/registry',WRANGLER_LOG_PATH:root+'/wrangler/logs',AGENTOS_TEST_URL:base,AGENTOS_CHAIN_URL:chain,AGENTOS_APP_ORIGIN:base,AGENTOS_CHAIN_STATE:root+'/chain',AGENTOS_CHAIN_PORT:String(ports.chain),AGENTOS_SUPPLIER_PORT:String(ports.supplier),AGENTOS_SUPPLIER_STATE:root+'/supplier',VITE_AGENTOS_LOCAL_PLUGIN_URL:pluginURL,AGENTOS_PLUGIN_RUNTIME_PORT:String(ports.plugin),AGENTOS_MCP_FIXTURE_PORT:String(ports.mcp),AGENTOS_PLUGIN_JOURNAL:root+'/plugins/journal',AGENTOS_MCP_SERVERS:JSON.stringify([{id:'local-chain',url:mcpURL+'/mcp',revision:'1.0.0',readTools:['vault_snapshot']}]),VITE_AGENTOS_LOCAL_CHAIN_URL:chain,VITE_AGENTOS_LOCAL_SUPPLIER_URL:supplier};
let stopping=false;const stop=()=>{if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');};for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);
const occupied=port=>new Promise(done=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();done(true);});socket.once('error',()=>done(false));});
async function run(name,args,ready,overrides={}){
 const log=await open(root+'/'+name+'.log','a',0o600),child=spawn(process.execPath,args,{cwd:name==='web'?process.cwd():root+'/source',env:{...env,...overrides},stdio:['ignore',log.fd,log.fd]});await log.close();children.push(child);
 let terminal=false;const finished=new Promise(done=>{child.once('exit',code=>{terminal=true;done(code);});child.once('error',()=>{terminal=true;done(1);});});
 if(!ready){const code=await finished;if(code!==0)throw new Error(name+' failed; inspect '+root+'/'+name+'.log');return;}
 void finished.then(()=>{if(!stopping){console.error(name+' stopped unexpectedly; inspect '+root+'/'+name+'.log');process.exitCode=1;stop();}});
 const deadline=Date.now()+600000;
 for(;;){if(terminal||stopping||Date.now()>deadline)throw new Error(name+' not ready; inspect '+root+'/'+name+'.log');try{const r=await fetch(ready,{signal:AbortSignal.timeout(3000)}),data=await r.json();if(r.ok&&(name==='web'?typeof data.scope==='string'&&Array.isArray(data.state?.tasks):name==='chain'?data.mode==='local'&&!!data.vault:name==='captured-source'||name==='source-proxy'||name.startsWith('supplier')||name==='mcp'||name==='plugins'?data.status==='ok':!!data.queue))break;}catch{}await new Promise(done=>setTimeout(done,500));}
 console.log('READY '+name+' '+ready);
}
try{
 for(const port of Object.values(ports))if(await occupied(port))throw new Error('Port '+port+' is already in use; no existing process was changed.');
 await mkdir(root,{recursive:true});
  console.log('SOURCE '+JSON.stringify(await(previous?verifyDemoSource(root+'/source'):syncDemoSource(root+'/source'))));
 if(!previous)await run('database',['scripts/db-local.mjs']);
 if(capturedSource)await run('captured-source',['scripts/usdc-replay.mjs'],'http://127.0.0.1:'+(ports.capture??ports.data)+'/health');
 if(sourceProxy)await run('source-proxy',['scripts/data-proxy.mjs'],'http://127.0.0.1:'+ports.data+'/health',{AGENTOS_SOURCE_PROXY_PORT:String(ports.data),AGENTOS_SOURCE_PROXY_UPSTREAM:capturedSource?'http://127.0.0.1:'+ports.capture+'/captured-usdc':process.env.AGENTOS_DATA_RPC_URL||'https://ethereum-rpc.publicnode.com',AGENTOS_SOURCE_PROXY_MODE:capturedSource?'captured-finalized-replay':'live-finalized-read'});
 await run('chain',['scripts/local-chain.mjs'],chain+'/config');
 await run('supplier2',['scripts/supplier-local.mjs'],'http://127.0.0.1:'+ports.supplier2+'/health',{AGENTOS_SUPPLIER_PORT:String(ports.supplier2),AGENTOS_SUPPLIER_STATE:root+'/supplier2',AGENTOS_SUPPLIER_ID:'local-transfer-supplier-2',AGENTOS_SUPPLIER_NAME:'Second independent transfer supplier',AGENTOS_SUPPLIER_WALLET_ROLE:'seller2'});
 await run('supplier',['scripts/supplier-local.mjs'],supplier+'/health',{AGENTOS_SUPPLIER_PEERS:JSON.stringify(['http://127.0.0.1:'+ports.supplier2])});
 await run('mcp',['scripts/plugins/mcp-fixture.mjs'],mcpURL+'/health');
 await run('plugins',['scripts/plugins/service.mjs'],pluginURL+'/health');
 await run('web',['scripts/run-framework.mjs','dev','--host','127.0.0.1','--port',String(ports.web)],base+'/api/workspace');
 await run('worker',['scripts/worker.mjs'],base+'/api/runtime/queue');
 const metadata={root,persistent:true,capturedSource,sourceProxy,...(sourceProxy?{sourceProxyURL:'http://127.0.0.1:'+ports.data}:{}),sourceMode:capturedSource?'captured-finalized-replay':'live-finalized-read',...(capturedSource?{replayURL:'http://127.0.0.1:'+ports.data}:{}),manageCurrent:previous?.manageCurrent??process.env.AGENTOS_DEMO_NO_CURRENT!=='1',sourceRoot:process.cwd(),sourceSnapshot:root+'/source',baseURL:base,chainURL:chain,supplierURL:supplier,pluginURL,mcpURL,supplier2URL:'http://127.0.0.1:'+ports.supplier2,identityEnabled:process.env.AGENTOS_DEMO_SKIP_IDENTITY!=='1',startedAt:new Date().toISOString(),pid:process.pid,children:children.map(c=>c.pid)};
 await writeFile(root+'/runtime.json',JSON.stringify(metadata,null,2));if(metadata.manageCurrent)await writeFile('.sites-runtime/isolated-demo/current.json',JSON.stringify(metadata,null,2));
 console.log('ISOLATED DEMO '+JSON.stringify(metadata));
 await new Promise(done=>{const timer=setInterval(()=>{if(stopping){clearInterval(timer);done();}},250);});
}catch(error){console.error(error.message);process.exitCode=1;stop();}

finally{stop();await Promise.all(children.filter(c=>c.exitCode===null).map(c=>new Promise(done=>{c.once('close',done);const timer=setTimeout(()=>{if(c.exitCode===null)c.kill('SIGKILL');},15000);timer.unref();})));}
