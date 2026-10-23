import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDemoSource} from './demo-source.mjs';
import {demoInvocation} from './demo-sequence.mjs';
export function validationVersion(runtimeCommit,checkoutCommit,changedPaths){
 const documentationOnly=changedPaths.every(path=>path==='README.md'||/^docs\/[^\0]+\.md$/.test(path));
 if(runtimeCommit!==checkoutCommit&&(!changedPaths.length||!documentationOnly))throw Error('Product code differs from baseline; upgrade baseline first.');
 return {runtimeCommit,checkoutCommit,documentationOnly:runtimeCommit!==checkoutCommit,changedDocumentation:changedPaths};
}
export const validationCommands={core:[['lint','--','--max-warnings','0'],['test'],['test:cre'],['typecheck'],['build']],browser:[['test:browser','--','--manage-models']],demo:[['demo:full','--','--manage-models']]};
export function validationPlan(phase,runtime){if(!['core','browser','demo','all'].includes(phase))throw Error('Unknown validation phase.');return (phase==='all'?Object.values(validationCommands).flat():validationCommands[phase]).map(args=>[...args,...(['test:browser','demo:full'].includes(args[0])?['--runtime',runtime]:[])]);}
if(process.argv[1]?.endsWith('/validate-local.mjs')){
 const phase=process.argv[2]||'all',profile=JSON.parse(await readFile('.sites-runtime/local-baseline/current.json')),runtime=JSON.parse(await readFile(profile.runtimePath)),source=await verifyDemoSource(runtime.sourceSnapshot),commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Validation requires a clean checkout.');
 const changedPaths=execFileSync('git',['diff','--name-only',source.parentCommit,commit],{encoding:'utf8'}).trim().split('\n').filter(Boolean),version=validationVersion(source.parentCommit,commit,changedPaths);
 const directory=resolve('outputs/unified-validation-'+crypto.randomUUID());await mkdir(directory,{recursive:true});const report={commit,...version,sourceDigest:source.sourceDigest,runtimePath:profile.runtimePath,phase,startedAt:new Date().toISOString(),steps:[],passed:false};
 for(const args of validationPlan(phase,profile.runtimePath)){
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit||execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Checkout changed during acceptance; start a new report.');
  const invocation=demoInvocation(args[0]),commandArgs=[...invocation.args,...args.slice(1)],start=Date.now();console.log('START '+args.join(' '));
  const result=await new Promise((done,reject)=>{const child=spawn(invocation.command,commandArgs,{stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b.toString();});child.once('error',reject);child.once('close',code=>done({code,output}));});
  const log=directory+'/'+args[0].replaceAll(':','-')+'.log';await writeFile(log,result.output);report.steps.push({command:args,code:result.code,durationMs:Date.now()-start,log,sha256:createHash('sha256').update(result.output).digest('hex')});await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log((result.code===0?'PASS ':'FAIL ')+args[0]);if(result.code!==0){process.exitCode=1;break;}
 }
 report.passed=report.steps.length===validationPlan(phase,profile.runtimePath).length&&report.steps.every(s=>s.code===0);report.finishedAt=new Date().toISOString();await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log('Evidence: '+directory+'/report.json');
}
