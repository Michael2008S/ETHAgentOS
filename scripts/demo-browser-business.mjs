import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {stopTestRuntime} from './runtime-resume.mjs';
const args=process.argv.slice(2);if(args.some((a,i)=>a!=='--runtime'&&args[i-1]!=='--runtime')||args.filter(a=>a==='--runtime').length>1)throw Error('Use --runtime <persistent non-current runtime.json>, or no arguments for a fresh environment.');
let launcher,test,controller,runtimePath=args[1],modelsBefore=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function health(){const r=await fetch('http://127.0.0.1:6100/health',{signal:AbortSignal.timeout(1500)});if(!r.ok)throw Error('Model controller unavailable');return r.json();}
async function exitChild(child){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');for(let i=0;i<150&&child.exitCode===null;i++)await wait(100);if(child.exitCode===null)child.kill('SIGKILL');}
let interrupted=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{interrupted=true;test?.kill('SIGTERM');launcher?.kill('SIGTERM');});
try{
 try{const h=await health();if(h.version!=='agentos.local-model-control.v1')throw Error('Unknown model controller');modelsBefore=h.owned;}catch(e){if(e.message==='Unknown model controller')throw e;controller=spawn(process.execPath,['scripts/model-control.mjs'],{stdio:'ignore'});for(let i=0;;i++){try{await health();break;}catch{if(i>=20||controller.exitCode!==null)throw Error('Start npm run models:control or inspect its occupied port.');await wait(250);}}}
 if(!runtimePath){
  launcher=spawn(process.execPath,['scripts/demo-isolated.mjs'],{env:{...process.env,AGENTOS_DEMO_NO_CURRENT:'1',AGENTOS_DEMO_COMMITTED_SOURCE:'1',AGENTOS_DEMO_SOURCE_PROXY:'1',AGENTOS_DEMO_CAPTURED_SOURCE:process.env.AGENTOS_BROWSER_LIVE==='1'?'0':'1',AGENTOS_DEMO_WEB_PORT:process.env.AGENTOS_BROWSER_WEB_PORT||'6397',AGENTOS_DEMO_CHAIN_PORT:'9755',AGENTOS_DEMO_SUPPLIER_PORT:'8671'},stdio:['ignore','pipe','pipe']});let text='';launcher.stderr.on('data',b=>process.stderr.write(b));
  runtimePath=await new Promise((done,reject)=>{launcher.stdout.on('data',bytes=>{const chunk=bytes.toString();process.stdout.write(chunk);text=(text+chunk).slice(-65536);const match=text.match(/ISOLATED DEMO (\{[^\n]+\})/);if(match){const r=JSON.parse(match[1]);done(r.root+'/runtime.json');}});launcher.once('exit',()=>reject(Error('Isolated environment exited before readiness.')));launcher.once('error',reject);});
 }
 const r=JSON.parse(await readFile(runtimePath,'utf8'));if(r.manageCurrent!==false||!r.persistent)throw Error('Browser restart acceptance requires a persistent non-current test instance.');if(interrupted)throw Error('Interrupted');
 test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config',r.sourceSnapshot+'/playwright.business.config.mjs'],{env:{...process.env,AGENTOS_TEST_URL:r.baseURL,AGENTOS_CHAIN_URL:r.chainURL,AGENTOS_FULL_BROWSER_RUNTIME:resolve(runtimePath),PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||resolve('.sites-runtime/playwright-browsers')},stdio:'inherit'});const code=await new Promise((done,reject)=>{test.once('exit',done);test.once('error',reject);});process.exitCode=code??1;
}finally{
 if(runtimePath)await stopTestRuntime(runtimePath).catch(()=>{});await exitChild(launcher);
 try{const h=await health();for(const model of h.owned.filter(n=>!modelsBefore.includes(n)))await fetch('http://127.0.0.1:6100/models',{method:'POST',headers:{'Content-Type':'application/json','x-agentos-model-control':'agentos-local-v1'},body:JSON.stringify({action:'stop',model})});}catch{}
 await exitChild(controller);
}
