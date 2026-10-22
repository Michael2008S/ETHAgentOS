import {spawn} from 'node:child_process';import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {resolve} from 'node:path';
const dir=resolve('outputs/erc8004-sepolia-2026-10-23/public-preparation');await mkdir(dir,{recursive:true});
const report={status:'preflight',startedAt:new Date().toISOString(),phases:[],workflowBindingEnabled:false,fundingEnabled:false,creDeploymentAttempted:false};
const save=()=>writeFile(dir+'/cloudflare-service-deployment.json',JSON.stringify(report,null,2));
const secret=(await readFile('.sites-runtime/sepolia-public/write-token','utf8')).trim();
async function run(name,args,input){const result=await new Promise((done,reject)=>{const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe']});let output='';for(const stream of[child.stdout,child.stderr])stream.on('data',b=>output+=b.toString().split(secret).join('[writer credential redacted]'));child.once('error',()=>reject(Error(name+' could not start')));child.once('close',code=>done({code,output}));child.stdin.end(input);});await writeFile(dir+'/'+name+'.log',result.output);report.phases.push({name,exitCode:result.code,log:name+'.log'});await save();if(result.code!==0)throw Error(name+' failed; inspect its redacted log');return result.output;}
const wrangler=(...args)=>['--import','./scripts/sites-env.mjs','node_modules/wrangler/bin/wrangler.js',...args];
try{
 await run('cloudflare-discovery',['scripts/sepolia-console/cloudflare-discover.mjs']);
 const discovery=JSON.parse(await readFile(dir+'/cloudflare-discovery.json','utf8'));if(discovery.accounts.length!==1)throw Error('Select an explicit Cloudflare account before deployment.');
 const account=discovery.accounts[0];report.account={id:account.id,name:account.name,workersSubdomain:account.workersSubdomain};
 if(!account.workersSubdomain||!account.r2Available){report.status='blocked-prerequisites';report.blockers=[...(!account.workersSubdomain?['Initialize workers.dev subdomain in Cloudflare Workers & Pages']:[]),...(!account.r2Available?['Enable R2 in Cloudflare Dashboard']:[])];await save();console.log(JSON.stringify(report,null,2));process.exitCode=2;}
 else{
 const origin='https://agentos-evidence-bd805f9b.'+account.workersSubdomain+'.workers.dev';report.origin=origin;
 await run('configure-public',['scripts/sepolia-console/prepare-public.mjs','--account-id',account.id,'--origin',origin]);
 const manifest=JSON.parse(await readFile('.sites-runtime/sepolia-public/manifest.json','utf8')),config=resolve('.sites-runtime/sepolia-public/wrangler.json');
 if(!account.bucketNames.includes(manifest.bucket))await run('create-r2-bucket',wrangler('r2','bucket','create',manifest.bucket,'--config',config));else{report.phases.push({name:'r2-bucket-already-exists',bucket:manifest.bucket});await save();}
 const deployLog=await run('deploy-evidence-worker',wrangler('deploy','--config',config,'--outdir',dir+'/deployed-worker-bundle'));report.workerDeployed=true;report.uploadedCodeVersionId=deployLog.match(/Current Version ID:\s*([a-f0-9-]+)/i)?.[1]??null;await save();
 await run('install-writer-secret',wrangler('secret','put','WRITE_TOKEN','--config',config),secret);report.writerSecretInstalled=true;await save();
 const before=(await readdir(dir)).filter(n=>n.startsWith('public-evidence-acceptance-'));
 await run('public-service-acceptance',['scripts/sepolia-console/verify-public-evidence.mjs']);
 report.acceptanceReports=(await readdir(dir)).filter(n=>n.startsWith('public-evidence-acceptance-')&&!before.includes(n));
 const workerSource=await readFile('services/evidence/worker.ts');report.workerSourceSHA256=createHash('sha256').update(workerSource).digest('hex');report.status='deployed-and-verified';
 manifest.notDeployed=false;manifest.publicEvidenceDeployed=true;manifest.publicEvidenceVerified=true;manifest.pending=['CRE deploy access','verify private-registry report owner matches immutable receiver owner','register actual workflow and verify returned ID'];await writeFile('.sites-runtime/sepolia-public/manifest.json',JSON.stringify(manifest,null,2));await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({status:report.status,origin,uploadedCodeVersionId:report.uploadedCodeVersionId,acceptanceReports:report.acceptanceReports},null,2));
 }
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{report.finishedAt=new Date().toISOString();await save();}
