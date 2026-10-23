import {withOperationLock} from './local-operation-lock.mjs';
import {readFile,writeFile,mkdir,readdir,cp,chmod,appendFile,open,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {syncDemoSource} from './demo-source.mjs';
import {stopTestRuntime} from './runtime-resume.mjs';
import {backupRuntime,restoreRuntime} from './runtime-backup.mjs';
const base=resolve('.sites-runtime/local-baseline'),pointer=base+'/current.json';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export const listening=port=>new Promise(done=>{const s=createConnection({host:'127.0.0.1',port});let ended=false;const finish=value=>{if(ended)return;ended=true;s.destroy();done(value);};s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.setTimeout(1000,()=>finish(false));});
export async function inspectRuntime(path){
 const runtime=JSON.parse(await readFile(path,'utf8')),services=[];
 for(const field of ['baseURL','chainURL','pluginURL','mcpURL','supplierURL','supplier2URL','ccipURL']){if(!runtime[field])continue;const u=new URL(runtime[field]);if(u.hostname!=='127.0.0.1'||u.protocol!=='http:')throw Error('Local runtime URLs required.');services.push({field,port:Number(u.port),listening:await listening(Number(u.port))});}
 const result={at:new Date().toISOString(),path:resolve(path),root:runtime.root,persistent:runtime.persistent===true,pid:runtime.pid,services};
 if(services.find(s=>s.field==='chainURL')?.listening){const config=await(await fetch(runtime.chainURL+'/config',{signal:AbortSignal.timeout(3000)})).json();const response=await fetch(runtime.chainURL+'/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['latest',false]}),signal:AbortSignal.timeout(3000)}),block=(await response.json()).result;if(!block?.hash)throw Error('Chain anchor unavailable.');result.chain={config,number:block.number,hash:block.hash};}
 return result;
}
async function inventory(root,prefix=''){const out=[];for(const e of await readdir(join(root,prefix),{withFileTypes:true})){const path=join(prefix,e.name);if(e.isSymbolicLink())throw Error('Archive refuses symlinks.');if(e.isDirectory()){await chmod(join(root,path),0o700);out.push(...await inventory(root,path));}else {await chmod(join(root,path),0o600);out.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')});}}return out;}
export async function archiveOfflineLegacy(path,destination){
 const before=await inspectRuntime(path);if(before.persistent||before.services.some(s=>s.listening))throw Error('Only the offline legacy instance may be archived by this command.');
 await mkdir(destination,{recursive:false,mode:0o700});const runtime=JSON.parse(await readFile(path));
 for(const name of ['db','plugins/journal']){await mkdir(dirname(join(destination,name)),{recursive:true,mode:0o700});await cp(join(runtime.root,name),join(destination,name),{recursive:true,errorOnExist:true,force:false});}
 await writeFile(destination+'/legacy-runtime.json',JSON.stringify(runtime,null,2),{mode:0o600});
 const manifest={version:'agentos.offline-legacy-archive.v1',before,restartable:false,reason:'Disk business archive only; legacy in-memory EVM is not recoverable from these files.',files:await inventory(destination)};
 await writeFile(destination+'/manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});return manifest;
}
async function event(action,phase,data){await mkdir(base,{recursive:true,mode:0o700});await appendFile(base+'/events.jsonl',JSON.stringify({at:new Date().toISOString(),action,phase,...data})+'\n',{mode:0o600});}
async function launch(args,env,logPath){const fd=await open(logPath,'a',0o600),child=spawn(process.execPath,args,{detached:true,env,stdio:['ignore',fd.fd,fd.fd]});await fd.close();child.unref();return child;}
async function awaitRuntime(path,pid){for(let i=0;i<600;i++){try{const r=JSON.parse(await readFile(path));if(r.pid===pid&&(await inspectRuntime(path)).services.every(s=>s.listening))return r;}catch{}await pause(250);}throw Error('Baseline start timed out; inspect startup log, do not replace existing state.');}
export const baseline=action=>withOperationLock(base+'/lifecycle.lock',()=>performBaseline(action));
async function performBaseline(action){
 await mkdir(base,{recursive:true,mode:0o700});
 if(action==='init'){
  try{await readFile(pointer);throw Error('Baseline already exists; use start.');}catch(e){if(e.code!=='ENOENT')throw e;}
  const legacyPath=resolve('.sites-runtime/isolated-demo/current.json'),archive=base+'/legacy-'+crypto.randomUUID();
  const legacy=await archiveOfflineLegacy(legacyPath,archive);await event(action,'before',{legacy:legacy.before,archive});
  const log=base+'/initial-start.log',child=await launch(['scripts/demo-isolated.mjs'],{...process.env,AGENTOS_DEMO_NO_CURRENT:'1',AGENTOS_DEMO_COMMITTED_SOURCE:'1',AGENTOS_DEMO_CAPTURED_SOURCE:'1',AGENTOS_DEMO_SOURCE_PROXY:'1',AGENTOS_DEMO_X402:'0',AGENTOS_DEMO_CCIP:'1',AGENTOS_DEMO_WEB_PORT:process.env.AGENTOS_BASELINE_PORT||'19977',AGENTOS_DEMO_CHAIN_PORT:'19997',AGENTOS_DEMO_SUPPLIER_PORT:'20007'},log);
  let runtimePath;
  for(let i=0;i<600;i++){const text=await readFile(log,'utf8');const match=text.match(/ISOLATED DEMO (\{[^\n]+\})/);if(match){runtimePath=JSON.parse(match[1]).root+'/runtime.json';break;}try{process.kill(child.pid,0);}catch{throw Error('Baseline launcher exited; inspect '+log);}await pause(250);}
  if(!runtimePath)throw Error('No baseline metadata; inspect '+log);
  const runtime=await awaitRuntime(runtimePath,child.pid),record={version:'agentos.local-baseline.v1',createdAt:new Date().toISOString(),runtimePath,legacyArchive:archive,legacyPath,legacyRestartable:false,chain:(await inspectRuntime(runtimePath)).chain,source:JSON.parse(await readFile(runtime.root+'/source.json'))};
  await writeFile(pointer,JSON.stringify(record,null,2),{mode:0o600});await event(action,'after',{state:await inspectRuntime(runtimePath)});return record;
 }
 const record=JSON.parse(await readFile(pointer)),before=await inspectRuntime(record.runtimePath);await event(action,'before',{state:before});
 if(action==='status')return before;
 if(action==='stop'){if(before.services.some(s=>s.listening)){await stopTestRuntime(record.runtimePath);record.lastStoppedChain=before.chain??record.lastStoppedChain;await writeFile(pointer,JSON.stringify(record,null,2),{mode:0o600});}}
 else if(action==='start'){
  if(before.services.some(s=>s.listening))throw Error('Baseline has live services; inspect status instead of starting another copy.');
  const r=JSON.parse(await readFile(record.runtimePath)),child=await launch([r.launcherSnapshot,'--resume',record.runtimePath],process.env,base+'/resume.log');await awaitRuntime(record.runtimePath,child.pid);
  const after=await inspectRuntime(record.runtimePath);if(JSON.stringify(record.chain.config)!==JSON.stringify(after.chain.config))throw Error('Deployment changed.');
  const anchor=record.lastStoppedChain??record.chain,response=await fetch(after.services.find(s=>s.field==='chainURL')?JSON.parse(await readFile(record.runtimePath)).chainURL+'/rpc':'',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:[anchor.number,false]})});if((await response.json()).result?.hash!==anchor.hash)throw Error('Historical chain anchor changed.');
 }else if(action==='upgrade'){
  if(before.services.some(s=>s.listening))throw Error('Stop baseline before upgrading.');
  const backup=await backupRuntime(record.runtimePath,base+'/pre-upgrade-'+crypto.randomUUID()),restored=await restoreRuntime(backup.backup,resolve('.sites-runtime/isolated-demo/upgraded-'+crypto.randomUUID()));
  const r=JSON.parse(await readFile(restored.runtimePath));await rm(r.sourceSnapshot,{recursive:true});record.source=await syncDemoSource(r.sourceSnapshot,{committed:true});r.launcherSnapshot=r.sourceSnapshot+'/scripts/demo-isolated.mjs';r.ccipEnabled=true;r.ccipURL='http://127.0.0.1:'+(Number(new URL(r.baseURL).port)+5);await writeFile(restored.runtimePath,JSON.stringify(r,null,2),{mode:0o600});record.previousRuntimePaths=[...(record.previousRuntimePaths??[]),record.runtimePath];record.runtimePath=restored.runtimePath;await writeFile(pointer,JSON.stringify(record,null,2),{mode:0o600});await event(action,'after',{backup:backup.backup,runtimePath:record.runtimePath,source:record.source});return record;
 }else if(action==='backup'){const result=await backupRuntime(record.runtimePath,base+'/backup-'+crypto.randomUUID());await event(action,'after',result);return result;}
 else if(action==='restore'){const backup=process.env.AGENTOS_BASELINE_BACKUP;if(!backup)throw Error('Set AGENTOS_BASELINE_BACKUP to a verified backup directory.');const result=await restoreRuntime(backup,resolve('.sites-runtime/isolated-demo/restored-'+crypto.randomUUID()));record.previousRuntimePaths=[...(record.previousRuntimePaths??[]),record.runtimePath];record.runtimePath=result.runtimePath;await writeFile(pointer,JSON.stringify(record,null,2),{mode:0o600});await event(action,'after',result);return result;}
 else throw Error('Use init/start/stop/status/backup/restore/upgrade.');
 const after=await inspectRuntime(record.runtimePath);await event(action,'after',{state:after});return after;
}
if(process.argv[1]===fileURLToPath(import.meta.url))baseline(process.argv[2]||'status').then(value=>console.log(JSON.stringify(value,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
