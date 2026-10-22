import {createServer,request} from 'node:http';
import {readFile,writeFile,mkdir,open,readdir,chmod,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import {syncDemoSource,verifyDemoSource} from './demo-source.mjs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export const recoverySocket=root=>'/private/tmp/agentos-components-'+process.getuid()+'-'+createHash('sha256').update(resolve(root)).digest('hex').slice(0,20)+'.sock';
export function recoveryEnvironment(r,source){return {...process.env,AGENTOS_PINNED_WEB_SOURCE:source,VINEXT_NO_DEV_LOCK:'1',AGENTOS_DEV_STATE_DIRECTORY:r.root+'/db',AGENTOS_DEV_CACHE_DIRECTORY:resolve('node_modules/.vite/agentos-recovered-'+r.root.split('/').at(-1)),SITES_RUNTIME_ROOT:r.root,WRANGLER_REGISTRY_PATH:r.root+'/dev-registry',MINIFLARE_REGISTRY_PATH:r.root+'/registry',WRANGLER_LOG_PATH:r.root+'/wrangler/logs',AGENTOS_TEST_URL:r.baseURL,AGENTOS_CHAIN_URL:r.chainURL,AGENTOS_APP_ORIGIN:r.baseURL,VITE_AGENTOS_LOCAL_CHAIN_URL:r.chainURL,VITE_AGENTOS_LOCAL_SUPPLIER_URL:r.supplierURL,VITE_AGENTOS_LOCAL_PLUGIN_URL:r.pluginURL,AGENTOS_PLUGIN_RUNTIME_PORT:new URL(r.pluginURL).port,AGENTOS_MCP_SERVERS:JSON.stringify([{id:'local-chain',url:r.mcpURL+'/mcp',revision:'1.0.0',readTools:['vault_snapshot']}]),AGENTOS_PLUGIN_JOURNAL:r.root+'/plugins/journal'};}
export function validateRecoveryRuntime(r,cwd=process.cwd()) {if(r.sourceRoot!==cwd||!r.root.startsWith(resolve(cwd,'.sites-runtime/isolated-demo')+'/')||!r.baseURL.startsWith('http://127.0.0.1:')||!Number.isInteger(r.pid)||r.pid<=1)throw Error('Select an owned local runtime with explicit metadata.');for(const k of ['baseURL','chainURL','pluginURL','mcpURL','supplierURL','supplier2URL']){const u=new URL(r[k]);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:'||!u.port)throw Error('Recovery only accepts loopback services.');}return r;}
const command=pid=>execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).trim();
const parent=pid=>Number(execFileSync('ps',['-p',String(pid),'-o','ppid='],{encoding:'utf8'}).trim());
function listener(url){const out=execFileSync('lsof',['-nP','-iTCP:'+new URL(url).port,'-sTCP:LISTEN','-Fp'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});const pids=[...new Set(out.split('\n').filter(s=>/^p\d+$/.test(s)).map(s=>Number(s.slice(1))))];if(pids.length!==1)throw Error('Expected exactly one owned listener for '+url);return pids[0];}
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Probe refused '+url+': '+r.status);return r.json();}
async function stop(pid,expected){if(command(pid)!==expected)throw Error('Component process identity changed.');process.kill(pid,'SIGTERM');for(let n=0;n<150;n++){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}await wait(100);}if(command(pid)!==expected)throw Error('Component identity changed during shutdown.');process.kill(pid,'SIGKILL');}
async function connect(socketPath,component){return new Promise((done,reject)=>{const req=request({socketPath,path:'/restart',method:'POST',headers:{'Content-Type':'application/json'}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>{try{const v=JSON.parse(text);res.statusCode===200?done(v):reject(Error(v.error));}catch(e){reject(e);}});});req.on('error',reject);req.end(JSON.stringify({component}));});}
export async function recoverLocalComponent(runtimePath,component){
 if(!['web','plugins'].includes(component))throw Error('Only web or plugins may be recovered; the chain is never a restart target.');
 const path=resolve(runtimePath),r=validateRecoveryRuntime(JSON.parse(await readFile(path,'utf8'))),socketPath=recoverySocket(r.root);
 if(r.componentRecovery){if(command(r.pid).includes('local-component-recovery.mjs'))return connect(socketPath,component);throw Error('Recovery manager identity changed; inspect it before adopting again.');}
 if(!command(r.pid).includes('scripts/demo-isolated.mjs'))throw Error('Expected the legacy all-or-nothing local supervisor.');
 const fields={web:'baseURL',plugins:'pluginURL',chain:'chainURL',mcp:'mcpURL',supplier:'supplierURL',supplier2:'supplier2URL'},services={};for(const [name,field]of Object.entries(fields)){const pid=listener(r[field]);if(parent(pid)!==r.pid||!r.children.includes(pid))throw Error('Listener ownership differs: '+name);services[name]={pid,command:command(pid)};}
 for(const pid of r.children){try{const cmd=command(pid);if(parent(pid)===r.pid&&cmd.includes('scripts/worker.mjs'))services.worker={pid,command:cmd};}catch{}}
 const deployment=await json(r.chainURL+'/config'),plugin=await fetch(r.pluginURL+'/health').then(x=>x.json());if(plugin.active!==0)throw Error('Wait for in-flight plugin work before recovery.');
 const id=crypto.randomUUID(),folder=r.root+'/component-recovery-'+id;await mkdir(folder,{recursive:true,mode:0o700});await writeFile(folder+'/runtime-before.json',JSON.stringify(r,null,2),{mode:0o600});
 const backups=[];for(const p of await readdir(r.root+'/db',{recursive:true})){if(!p.endsWith('.sqlite'))continue;const target=folder+'/db/'+p;await mkdir(dirname(target),{recursive:true});const db=new DatabaseSync(r.root+'/db/'+p,{readOnly:true});try{await backup(db,target);}finally{db.close();}backups.push(target);}if(!backups.length)throw Error('No original SQLite database found; refusing to continue.');
 const source=folder+'/source';await syncDemoSource(source,{committed:true});await verifyDemoSource(source);
 const environment=recoveryEnvironment(r,source);let busy=false;
 async function persist(){const current={...r,pid:process.pid,children:[...new Set(Object.values(services).map(s=>s.pid))],componentRecovery:{version:1,socketPath,legacySupervisorPid:r.pid,folder,source,services,chainPid:services.chain.pid,adoptedAt:new Date().toISOString()}};await writeFile(r.root+'/runtime.json',JSON.stringify(current,null,2));const selected=JSON.parse(await readFile('.sites-runtime/isolated-demo/current.json'));if(selected.root===r.root)await writeFile('.sites-runtime/isolated-demo/current.json',JSON.stringify(current,null,2));}
 async function replace(name){if(!['web','plugins'].includes(name))throw Error('Chain recovery is explicitly prohibited.');if(busy)throw Error('Another component recovery is active.');busy=true;try{
  if(listener(r.chainURL)!==services.chain.pid||JSON.stringify(await json(r.chainURL+'/config'))!==JSON.stringify(deployment))throw Error('Original chain identity differs.');
  if(name==='plugins'&&(await fetch(r.pluginURL+'/health').then(x=>x.json())).active!==0)throw Error('Plugin work is still active.');
  const old=services[name];await stop(old.pid,old.command);
  const pluginSource=r.sourceSnapshot;const cwd=name==='web'?process.cwd():pluginSource,args=name==='web'?['node_modules/vite/bin/vite.js','--config',source+'/vite.config.ts','--host','127.0.0.1','--port',new URL(r.baseURL).port]:['scripts/plugins/service.mjs'];
  const log=await open(folder+'/'+name+'.log','a',0o600),child=spawn(process.execPath,args,{cwd,env:environment,stdio:['ignore',log.fd,log.fd]});await log.close();child.on('error',e=>console.error(name,e.message));services[name]={pid:child.pid,command:command(child.pid)};await persist();
  const until=Date.now()+600000;for(;;){if(child.exitCode!==null)throw Error(name+' stopped; inspect '+folder+'/'+name+'.log');if(Date.now()>until)throw Error(name+' recovery timed out; its data and chain were retained.');try{const v=await json(r[fields[name]]+(name==='web'?'/api/workspace':'/health'));if(name==='web'?Array.isArray(v.state?.tasks):v.status==='ok')break;}catch{}await wait(500);}
  if(listener(r.chainURL)!==services.chain.pid||JSON.stringify(await json(r.chainURL+'/config'))!==JSON.stringify(deployment))throw Error('Chain identity changed during recovery.');
  const result={component:name,status:'recovered',pid:child.pid,chainPid:services.chain.pid,deploymentUnchanged:true,folder};await writeFile(folder+'/'+name+'-result.json',JSON.stringify(result,null,2));return result;
 }finally{busy=false;}}
 const server=createServer(async(req,res)=>{if(req.url!=='/restart'||req.method!=='POST'){res.writeHead(404);res.end();return;}let input='';for await(const b of req){input+=b;if(input.length>256){res.writeHead(413);res.end();return;}}try{const body=JSON.parse(input);if(Object.keys(body).join()!=='component')throw Error('Invalid recovery request.');const result=await replace(body.component);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch(e){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(socketPath,done);});await chmod(socketPath,0o600);
 // Freeze only the legacy supervisor, then retire it without invoking its
 // all-child shutdown handler. Existing chain/supplier/MCP/worker PIDs survive.
 process.kill(r.pid,'SIGSTOP');try{for(const s of Object.values(services))if(parent(s.pid)!==r.pid)throw Error('Child ownership changed before supervisor handoff.');process.kill(r.pid,'SIGKILL');}catch(e){try{process.kill(r.pid,'SIGCONT');}catch{}server.close();await unlink(socketPath).catch(()=>{});throw e;}
 await persist();console.log('SUPERVISOR_ADOPTED '+JSON.stringify({pid:process.pid,chainPid:services.chain.pid,backups:backups.length,folder}));
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.close();void unlink(socketPath).catch(()=>{});/* Adopted services, especially the in-memory chain, stay alive. */});
 return replace(component);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [runtimePath,component]=process.argv.slice(2);console.log(JSON.stringify(await recoverLocalComponent(runtimePath||'.sites-runtime/isolated-demo/current.json',component)));}
