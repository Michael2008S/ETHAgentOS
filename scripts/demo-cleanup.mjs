import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

const known=new Set(['demo-isolated.mjs','demo-start.mjs','model-local.mjs','model-planning-local.mjs','model-memory-local.mjs','local-chain.mjs','supplier-local.mjs','worker.mjs','plugins/service.mjs','plugins/mcp-fixture.mjs']);
export function processRows(text){return text.split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/);return m?[{pid:+m[1],ppid:+m[2],rssKB:+m[3],started:m[4],command:m[5]}]:[];});}
const fingerprint=p=>createHash('sha256').update(p.started+'\0'+p.command).digest('hex');
function scriptOf(p,root){const m=p.command.match(/^(?:\S*\/)?node\s+(\S+)$/);if(!m)return;const script=m[1].startsWith(root+'/')?m[1].slice(root.length+1):m[1];if(!script.startsWith('scripts/'))return;const name=script.slice(8);return known.has(name)?name:undefined;}
export function cleanupPlan(rows,{root,currentPID,models=false,all=false}){
 const owned=rows.filter(p=>p.cwd===root),byPID=new Map(rows.map(p=>[p.pid,p]));
 const active=owned.filter(p=>p.pid!==process.pid&&(/node_modules\/@playwright\/test\/cli\.js\s+test|\bnode\s+--test\b|scripts\/demo-full\.mjs(?:\s|$)/.test(p.command)));
 if(active.length)throw Error('Validation is active. Finish it before cleaning runtime processes.');
 const descendants=ids=>{const set=new Set(ids);for(let changed=true;changed;){changed=false;for(const p of rows)if(set.has(p.ppid)&&!set.has(p.pid)){set.add(p.pid);changed=true;}}return set;};
 const protectedPIDs=all?new Set():descendants(currentPID?[currentPID]:[]);
 // Stop only a verified Node launcher in this checkout. Editor/Codex helpers and
 // arbitrary Node processes are never selected just because their cwd matches.
 const roots=owned.filter(p=>{const script=scriptOf(p,root);if(!script||protectedPIDs.has(p.pid))return false;if(script.startsWith('model-'))return models;return all||script==='demo-isolated.mjs';});
 const rootPIDs=new Set(roots.map(p=>p.pid)),top=roots.filter(p=>{let q=byPID.get(p.ppid);while(q){if(rootPIDs.has(q.pid))return false;q=byPID.get(q.ppid);}return true;});
 const selected=descendants(top.map(p=>p.pid));for(const pid of protectedPIDs)selected.delete(pid);
 const targets=rows.filter(p=>selected.has(p.pid)).map(p=>({pid:p.pid,ppid:p.ppid,rssKB:p.rssKB,fingerprint:fingerprint(p),role:scriptOf(p,root)??basename(p.command.split(' ')[0]),launcher:top.some(t=>t.pid===p.pid)}));
 return {root,currentPID,models,all,targets,estimatedRSSMiB:Math.round(targets.reduce((n,p)=>n+p.rssKB,0)/1024)};
}
export async function applyCleanup(plan,{snapshot,signal=(pid)=>process.kill(pid,'SIGTERM'),wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const sent=[],changed=new Set();const send=async target=>{const now=(await snapshot()).find(p=>p.pid===target.pid);if(now&&fingerprint(now)!==target.fingerprint){changed.add(target.pid);return;}if(now){signal(target.pid);sent.push(target.pid);}};
 for(const target of plan.targets.filter(p=>p.launcher))await send(target);
 await wait(1500);
 // A launcher may have exited while a workerd child remains. Only use the
 // original descendant snapshot, and recheck PID start time and command.
 for(const target of plan.targets.filter(p=>!p.launcher))await send(target);
 await wait(500);const live=await snapshot(),remaining=plan.targets.filter(t=>live.some(p=>p.pid===t.pid&&fingerprint(p)===t.fingerprint));
 return {at:new Date().toISOString(),...plan,signalled:[...new Set(sent)],changedPIDs:[...changed],remaining:remaining.map(p=>p.pid),stopped:plan.targets.length-remaining.length-changed.size,stoppedRSSMiB:Math.round(plan.targets.filter(t=>!changed.has(t.pid)&&!remaining.some(r=>r.pid===t.pid)).reduce((n,p)=>n+p.rssKB,0)/1024),dataPreserved:true};
}
export async function runtimeSnapshot(root){
 const rows=processRows(execFileSync('ps',['-axo','pid=,ppid=,rss=,lstart=,args='],{encoding:'utf8',env:{...process.env,LC_ALL:'C'}}));
 for(const p of rows){if(!scriptOf(p,root)&&!/node_modules\/@playwright\/test\/cli\.js\s+test|\bnode\s+--test\b|scripts\/demo-full\.mjs(?:\s|$)/.test(p.command))continue;try{p.cwd=execFileSync('lsof',['-a','-p',String(p.pid),'-d','cwd','-Fn'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').find(l=>l.startsWith('n'))?.slice(1);}catch{}}
 return rows;
}
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--apply','--models','--all'].includes(a)))throw Error('Usage: npm run demo:cleanup -- [--apply] [--models] [--all]');
 const root=resolve('.');let current;try{current=JSON.parse(await readFile('.sites-runtime/isolated-demo/current.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const snapshot=()=>runtimeSnapshot(root),rows=await snapshot();
 // Never trust a stale manifest PID to protect an unrelated process tree.
 const currentPID=rows.find(p=>p.pid===current?.pid&&p.cwd===root&&scriptOf(p,root)==='demo-isolated.mjs')?.pid;
 const plan=cleanupPlan(rows,{root,currentPID,models:args.includes('--models'),all:args.includes('--all')});
 if(!args.includes('--apply')){console.log(JSON.stringify({dryRun:true,...plan},null,2));return;}
 const report=await applyCleanup(plan,{snapshot});await mkdir('outputs',{recursive:true});const file='outputs/process-cleanup-'+crypto.randomUUID()+'.json';await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify({stopped:report.stopped,stoppedRSSMiB:report.stoppedRSSMiB,remaining:report.remaining,report:file}));if(report.remaining.length)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
