import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPublicClient,http} from 'viem';
import {AgentCCIPClient} from '../sdk/ccip.ts';
import {escrowABI} from '../sdk/chain.ts';
import {ccipTerminal} from '../lib/agentos/ccip-tasks.ts';
import {verifyDemoSource} from './demo-source.mjs';
import {resumeTestRuntime,stopTestRuntime} from './runtime-resume.mjs';
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
export function soakCoverage(samples,elapsedMs,requiredMs){return {elapsedMs,requiredMs,sampleCount:samples.length,passed:elapsedMs>=requiredMs&&samples.length>=Math.floor(requiredMs/15000)*0.8&&samples.every(s=>s.ok)};}
export async function runProductSoak(path,{seconds=7200,smoke=false,stopRuntime=false}={}){
 if(!Number.isInteger(seconds)||seconds<(smoke?60:7200)||seconds>86400)throw Error('Acceptance needs at least 7200 real seconds; --smoke is only a driver check.');
 path=resolve(path);let runtime=JSON.parse(await readFile(path)),source=await verifyDemoSource(runtime.sourceSnapshot);
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(source.parentCommit!==commit||!runtime.ccipEnabled||runtime.manageCurrent!==false||execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Select a clean, current-commit isolated persistent dual-chain runtime.');
 const directory=resolve('outputs/product-soak-'+crypto.randomUUID());await mkdir(directory,{recursive:true});
 const report={commit,sourceDigest:source.sourceDigest,runtimePath:path,sourceMode:runtime.sourceMode,smoke,startedAt:new Date().toISOString(),requiredSeconds:seconds,samples:[],actions:[],passed:false};
 const sandbox='product-soak-'+crypto.randomUUID(),headers={'x-agentos-sandbox':sandbox,'x-agentos-queue-only':'1'},client=new AgentCCIPClient(runtime.baseURL,headers);report.sandbox=sandbox;
 const save=()=>writeFile(directory+'/report.json',JSON.stringify(report,null,2));
 const json=async(url,init={})=>{const response=await fetch(runtime.baseURL+url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(url+' '+response.status);return response.json();};
 const create=async(scenario)=>client.create({requestId:crypto.randomUUID(),title:'Sustained '+scenario,budgetCents:100,durationSeconds:600,scenario:scenario==='cancel'?'success':scenario,approved:true,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'treasury',to:'research',cents:123}]}});
 let interrupted=false;const interrupt=()=>{interrupted=true;};process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 const started=performance.now();let restarted=false,nextScenario=0;const tasks=[];
 try{
  await client.list();
  while(performance.now()-started<seconds*1000){
   if(interrupted)throw Error('Observer interrupted; this run is incomplete.');
   assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit,'Checkout changed during soak');assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','Checkout changed during soak');
   await verifyDemoSource(runtime.sourceSnapshot);
   const elapsed=performance.now()-started;
   if(nextScenario<3&&elapsed>=nextScenario*seconds*1000/3){const scenario=['success','invalid-delivery','cancel'][nextScenario++],task=await create(scenario);tasks.push({id:task.id,scenario});if(scenario==='cancel')await client.control(task.id,'cancel');report.actions.push({at:new Date().toISOString(),action:'create',scenario,id:task.id});}
   for(const task of tasks){let current=await client.get(task.id);if(!ccipTerminal(current)){
    // Stop at a real paid-but-uncollected checkpoint before the intentional process crash.
    for(let i=0;i<12&&!ccipTerminal(current);i++){
     await client.control(task.id,'recover');current=await client.get(task.id);
     if(task.scenario==='success'&&!restarted&&current.evidence?.escrowStatus===2){
      const before=current,ccipPid=runtime.components.ccip,command=execFileSync('ps',['-p',String(ccipPid),'-o','command='],{encoding:'utf8'}),cwd=execFileSync('lsof',['-a','-p',String(ccipPid),'-d','cwd','-Fn'],{encoding:'utf8'}).split('\n').find(s=>s.startsWith('n'))?.slice(1);
      assert.ok(command.includes('scripts/ccip/service.mjs'));assert.equal(cwd,runtime.sourceSnapshot);assert.equal(before.reservedCents,100);
      const outageStart=performance.now();process.kill(ccipPid,'SIGKILL');
      let unavailable=false;for(let n=0;n<50&&!unavailable;n++){try{const r=await fetch(runtime.ccipURL+'/health',{signal:AbortSignal.timeout(500)});unavailable=!r.ok;}catch{unavailable=true;}if(!unavailable)await sleep(100);}assert.ok(unavailable,'Crash must be observed');
      let alive=true;for(let n=0;n<300&&alive;n++){try{process.kill(runtime.pid,0);await sleep(100);}catch{alive=false;}}assert.equal(alive,false,'Owned launcher must finish cleanup before resume');
      runtime=(await resumeTestRuntime(path)).runtime;assert.equal((await verifyDemoSource(runtime.sourceSnapshot)).sourceDigest,source.sourceDigest);
      const after=await client.get(task.id);assert.equal(after.termsHash,before.termsHash);assert.equal(after.reservedCents,100);assert.deepEqual(after.deployment,before.deployment);
      report.actions.push({action:'actual-CCIP-SIGKILL-and-persistent-runtime-resume',at:new Date().toISOString(),outageObserved:true,outageMs:performance.now()-outageStart,id:task.id,termsHash:after.termsHash});restarted=true;current=after;
     }
    }
   }}
   const funds=await json('/api/funds'),jobs=await client.list(),queue=await json('/api/runtime/queue');assert.equal(funds.scope,client.scope);assert.deepEqual(funds.unavailable,[]);assert.equal(funds.balances.length,3);assert.equal(queue.queue.dead,0);
   for(const task of jobs){const row=funds.records.find(r=>r.id===task.id&&r.pool==='ccip');assert.ok(row);assert.equal(row.reserved,String(task.reservedCents));if(ccipTerminal(task))assert.equal(row.reserved,'0');}
   report.samples.push({at:new Date().toISOString(),elapsedMs:performance.now()-started,ok:true,revision:funds.revision,queue:queue.queue,tasks:jobs.map(j=>({id:j.id,status:j.status,reservedCents:j.reservedCents,termsHash:j.termsHash})),balances:funds.balances});await save();console.log('SOAK '+Math.floor((performance.now()-started)/1000)+'/'+seconds+'s '+jobs.map(j=>j.status).join(','));
   await sleep(Math.min(15000,Math.max(0,seconds*1000-(performance.now()-started))));
  }
  const final=await client.list();assert.equal(final.length,3);assert.ok(restarted);
  for(const task of tasks){const job=final.find(j=>j.id===task.id);assert.equal(job.status,task.scenario==='success'?'completed':task.scenario==='cancel'?'cancelled':'refunded');assert.equal(job.reservedCents,0);if(task.scenario!=='cancel'){const rpc=createPublicClient({transport:http(runtime.ccipURL+'/chain/b')});for(const eventName of ['Opened','Settled'])assert.equal((await rpc.getContractEvents({address:job.deployment.b.escrow,abi:escrowABI,eventName,args:{id:job.chainTaskId},fromBlock:0n})).length,1,'No duplicate escrow or settlement');}}
  report.coverage=soakCoverage(report.samples,performance.now()-started,seconds*1000);assert.ok(report.coverage.passed);report.finalTasks=final;report.passed=true;report.acceptancePassed=!smoke;
 }catch(error){report.error=error.stack;report.acceptancePassed=false;throw error;}
 finally{
  report.finishedAt=new Date().toISOString();report.actualElapsedMs=performance.now()-started;process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
  if(stopRuntime)try{await stopTestRuntime(path);report.runtimeStopped=true;}catch(error){report.cleanupError=error.message;report.passed=false;report.acceptancePassed=false;}
  await save();console.log('Evidence: '+directory+'/report.json');
 }
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),path=args[args.indexOf('--runtime')+1];try{if(!args.includes('--runtime'))throw Error('--runtime required');const index=args.indexOf('--seconds');const report=await runProductSoak(path,{seconds:index<0?7200:Number(args[index+1]),smoke:args.includes('--smoke'),stopRuntime:args.includes('--stop-runtime')});if(!report.passed)throw Error('Soak or cleanup failed; inspect evidence.');}catch(error){console.error(error);process.exitCode=1;}}
