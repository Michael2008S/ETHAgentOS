import {verifyDemoSource} from './demo-source.mjs';
import {readFile,open} from 'node:fs/promises';import {spawn,execFileSync} from 'node:child_process';import {resolve} from 'node:path';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function stopTestRuntime(path){
 const r=JSON.parse(await readFile(path,'utf8'));if(r.persistent!==true||r.manageCurrent!==false||r.sourceRoot!==process.cwd()||!r.root.startsWith(resolve('.sites-runtime/isolated-demo')+'/'))throw Error('Only explicitly isolated non-current test runtimes may be stopped.');
 const cwd=execFileSync('lsof',['-a','-p',String(r.pid),'-d','cwd','-Fn'],{encoding:'utf8'}).split('\n').find(l=>l.startsWith('n'))?.slice(1),cmd=execFileSync('ps',['-p',String(r.pid),'-o','command='],{encoding:'utf8'}).trim();if(cwd!==process.cwd()||!cmd.includes('scripts/demo-isolated.mjs'))throw Error('Runtime process ownership changed.');
 process.kill(r.pid,'SIGTERM');for(let i=0;i<300;i++){let alive=true;try{process.kill(r.pid,0);}catch{alive=false;}if(!alive)return r;await wait(100);}throw Error('Owned runtime did not exit; no unrelated process was stopped.');
}
export async function resumeTestRuntime(path){
 const old=JSON.parse(await readFile(path,'utf8'));if(old.manageCurrent!==false||!old.persistent)throw Error('Select a persistent isolated test runtime.');if(old.launcherSnapshot)await verifyDemoSource(old.sourceSnapshot);const log=await open(old.root+'/resume.log','a',0o600),child=spawn(process.execPath,[old.launcherSnapshot??'scripts/demo-isolated.mjs','--resume',resolve(path)],{env:process.env,stdio:['ignore',log.fd,log.fd]});await log.close();let closed=false;child.on('error',()=>{closed=true;});child.on('exit',()=>{closed=true;});
 for(let i=0;i<1200;i++){if(closed)throw Error('Runtime resume failed; inspect its preserved resume log.');try{const current=JSON.parse(await readFile(path,'utf8'));if(current.pid===child.pid){const response=await fetch(current.baseURL+'/api/workspace',{signal:AbortSignal.timeout(1000)});if(response.ok)return {child,runtime:current};}}catch{}await wait(250);}child.kill('SIGTERM');throw Error('Runtime resume timed out.');
}
