import{DatabaseSync}from'node:sqlite';
import{readFile,writeFile,appendFile,mkdir,rename,readdir}from'node:fs/promises';import{resolve}from'node:path';import{fileURLToPath}from'node:url';
import{baseline,inspectRuntime}from'./local-baseline.mjs';
const root=resolve('.sites-runtime/local-baseline'),statePath=root+'/operations-state.json';
export function supervisionDecision(snapshot,restarts=[],now=Date.now()){
 const recent=restarts.filter(t=>now-t<600000),healthy=snapshot.services.every(s=>s.listening);
 return{healthy,recent,mayRestart:!healthy&&recent.length<3,reason:healthy?'healthy':recent.length>=3?'restart-budget-exhausted':'runtime-unavailable'};
}
export async function localQueueCounts(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=directory+'/'+entry.name;
  if(entry.isDirectory()){const result=await localQueueCounts(path);if(result)return result;}
  else if(entry.name.endsWith('.sqlite')){const db=new DatabaseSync(path,{readOnly:true});try{db.exec('PRAGMA busy_timeout=1000');if(!db.prepare("SELECT name FROM sqlite_master WHERE name='agentos_runtime_jobs'").get())continue;const counts={pending:0,leased:0,completed:0,dead:0};for(const row of db.prepare('SELECT status,COUNT(*) count FROM agentos_runtime_jobs GROUP BY status').all())counts[row.status]=row.count;return counts;}finally{db.close();}}
 }
 return null;
}
async function save(value){const temporary=statePath+'.'+process.pid+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600});await rename(temporary,statePath);}
async function alert(kind,details){await appendFile(root+'/alerts.jsonl',JSON.stringify({at:new Date().toISOString(),kind,...details})+'\n',{mode:0o600});console.log('LOCAL ALERT '+kind);}
export async function operationsProbe({repair=false}={}){
 await mkdir(root,{recursive:true,mode:0o700});const profile=JSON.parse(await readFile(root+'/current.json')),runtime=JSON.parse(await readFile(profile.runtimePath));let state;try{state=JSON.parse(await readFile(statePath));}catch{state={restarts:[]};}
 if(state.runtimePath!==profile.runtimePath)state={restarts:[],runtimePath:profile.runtimePath};
 const snapshot=await inspectRuntime(profile.runtimePath),decision=supervisionDecision(snapshot,state.restarts),warnings=[];
 if(decision.healthy){
  if(runtime.ccipURL){try{const response=await fetch(runtime.ccipURL+'/health',{signal:AbortSignal.timeout(3000)}),health=await response.json();if(!response.ok||health.status!=='ok')warnings.push('ccip-health-unavailable');else warnings.push(...health.alerts??[]);}catch{warnings.push('ccip-health-unavailable');}}
  try{const queue=await localQueueCounts(runtime.root+'/db');if(!queue)warnings.push('d1-unavailable');else {state.queue=queue;if(queue.dead)warnings.push('queue-needs-owner-retry');}}catch{warnings.push('d1-unavailable');}
 }
 const fingerprint=JSON.stringify({reason:decision.reason,warnings});if(state.fingerprint!==fingerprint){await alert(decision.healthy?(warnings.length?'degraded':'recovered'):'runtime-unavailable',{warnings,failedPorts:snapshot.services.filter(s=>!s.listening).map(s=>s.port)});state.fingerprint=fingerprint;}
 state.checkedAt=new Date().toISOString();state.status=decision.healthy?(warnings.length?'degraded':'healthy'):'unavailable';state.warnings=warnings;state.snapshot=snapshot;state.restarts=decision.recent;
 if(repair&&decision.mayRestart){
  // Persist restart budget before any mutation, and use the existing ownership-checked lifecycle.
  state.restarts.push(Date.now());await save(state);
  try{if(snapshot.services.some(s=>s.listening))await baseline('stop');await baseline('start');await alert('runtime-restarted',{runtimePath:profile.runtimePath});state.status='restarted';}
  catch(error){await alert('restart-failed',{reason:String(error.message).slice(0,160)});state.status='restart-failed';}
 }else if(repair&&!decision.healthy&&!decision.mayRestart)await alert('manual-recovery-required',{reason:decision.reason});
 await save(state);return state;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const watch=process.argv.includes('--watch'),repair=process.argv.includes('--repair');let running=true;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{running=false;});
 do{try{console.log(JSON.stringify(await operationsProbe({repair})));}catch(error){console.error('Local operations unavailable: '+error.message);if(!watch)process.exitCode=1;}if(watch&&running)await new Promise(r=>setTimeout(r,5000));}while(watch&&running);
}
