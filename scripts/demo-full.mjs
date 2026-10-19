import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
// Run serially: supplier fault injection and EVM clock changes must not overlap.
const resume=process.argv.indexOf('--resume');
const resumeFile=resume>=0&&process.argv[resume+1]?resolve(process.argv[resume+1]):null;
if(resume>=0&&(!resumeFile||!resumeFile.startsWith(resolve('outputs')+'/full-demo-')||!resumeFile.endsWith('/report.json')))throw new Error('Resume requires an outputs/full-demo-*/report.json path.');
const directory=resumeFile?dirname(resumeFile):resolve('outputs/full-demo-'+crypto.randomUUID());
await mkdir(directory,{recursive:true});
const report=resumeFile?JSON.parse(await readFile(resumeFile,'utf8')):{startedAt:new Date().toISOString(),scope:'local HTTP/D1/EVM and authenticated CRE dry-run; no broadcast',steps:[]};
const steps=['demo:doctor','test:api','demo','demo:deadline','demo:wallet','demo:reconcile','demo:prefund','demo:queue','demo:chain','demo:model','demo:identity','demo:supplier','demo:planning','demo:showcase','demo:evidence','demo:cre','demo:doctor'];
if(!Array.isArray(report.steps)||report.steps.some((step,index)=>step.command!==steps[index]))throw new Error('Report does not match this demo sequence.');
const failed=report.steps.findIndex(step=>step.code!==0),startIndex=failed>=0?failed:report.steps.length;
if(failed>=0){report.failedAttempts=[...(report.failedAttempts??[]),...report.steps.slice(failed)];report.steps=report.steps.slice(0,failed);}
if(resumeFile)report.resumedAt=[...(report.resumedAt??[]),new Date().toISOString()];
report.passed=false;delete report.finishedAt;
let active;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>active?.kill(signal));
for(const [index,name] of steps.entries()){
 if(index<startIndex)continue;
 const attempt=1+(report.failedAttempts??[]).filter(step=>step.command===name).length;
 const start=Date.now(),log=directory+'/'+String(index+1).padStart(2,'0')+'-'+name.replaceAll(':','-')+(attempt>1?'-attempt-'+attempt:'')+'.log';
 console.log('START '+name);
 const code=await new Promise((done,reject)=>{
  active=spawn(process.execPath,[process.env.npm_execpath||'node_modules/npm/bin/npm-cli.js','run',name,...(name==='demo:showcase'?['--','--fresh']:[])],{stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [active.stdout,active.stderr])stream.on('data',chunk=>{output+=chunk.toString();});
  active.once('error',reject);active.once('close',async code=>{await writeFile(log,output);done(code??1);});
 });
 active=undefined;report.steps.push({command:name,code,durationMs:Date.now()-start,log});
 await writeFile(directory+'/report.json',JSON.stringify(report,null,2));
 console.log((code===0?'PASS ':'FAIL ')+name+' ('+Math.round((Date.now()-start)/1000)+'s) '+log);
 if(code!==0){process.exitCode=1;break;}
}
report.finishedAt=new Date().toISOString();report.passed=report.steps.length===steps.length&&report.steps.every(s=>s.code===0);
await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log('Report: '+directory+'/report.json');
