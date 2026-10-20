import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve,dirname,delimiter } from 'node:path';
import { startLocalChain } from './local-chain.mjs';
import { AgentWalletSession,deliveryBytes } from '../sdk/wallet.ts';
import { seed,transition } from '../lib/agentos/engine.ts';
import { verifyDelivery,resultHash } from '../cre/workflow/verify.ts';

const id=crypto.randomUUID(),root=resolve('.sites-runtime/cre-simulation/'+id);
await mkdir(root+'/workflow',{recursive:true});
const local=await startLocalChain({port:0});
const report={mode:'CRE CLI dry-run against local EVM RPC',startedAt:new Date().toISOString(),id,cases:[]};
try{
 const session=await AgentWalletSession.connect(local.provider,local.config,false);
 await writeFile(root+'/project.yaml','staging-settings:\n  rpcs:\n    - chain-name: ethereum-testnet-sepolia\n      url: '+local.base+'/rpc\n');
 await writeFile(root+'/workflow/workflow.yaml','staging-settings:\n  user-workflow:\n    workflow-name: agentos-local-simulation\n  workflow-artifacts:\n    workflow-path: '+JSON.stringify(resolve('cre/workflow/main.ts'))+'\n    config-path: ./config.json\n    secrets-path: ""\n');
 const key=local.provider.getInitialAccounts()[local.buyer.toLowerCase()].secretKey;
 const bunDir=process.env.AGENTOS_BUN_BIN?dirname(resolve(process.env.AGENTOS_BUN_BIN)):resolve('.sites-runtime/cre-tools/node_modules/.bin');
 const env={...process.env,CRE_ETH_PRIVATE_KEY:key,PATH:[bunDir,process.env.PATH||''].join(delimiter)};
 const cli=process.env.AGENTOS_CRE_BIN||(existsSync('.sites-runtime/cre-bin/cre')?resolve('.sites-runtime/cre-bin/cre'):'cre');
 const args=['workflow','simulate','./workflow','--project-root',root,'--target','staging-settings','--wasm',resolve('outputs/agentos-cli.wasm'),'--trigger-index','0','--non-interactive'];
 async function simulate(config){
  await writeFile(root+'/workflow/config.json',JSON.stringify(config,null,2));
  const attempts=[];
  for(let attempt=1;attempt<=3;attempt++){
   const result=await new Promise((resolve,reject)=>{
   const child=spawn(cli,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';
   const timer=setTimeout(()=>child.kill('SIGTERM'),120000);
   for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{const text=data.toString().split(key).join('[ephemeral key redacted]');output+=text;process.stdout.write(text);});
   child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);resolve({code,output});});
   });
   attempts.push(result);
   if(!/Post \"https:\/\/api\.cre\.chain\.link\/graphql\": EOF/.test(result.output)||attempt===3)return {...result,attempts};
   console.log('Retrying transient CRE account API EOF ('+attempt+'/3); no transaction was broadcast.');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }
 for(const scenario of ['success','invalid-delivery','treasury-success','treasury-detail-tamper']){
  const taskId=id+'-'+scenario;
  let state=await transition(seed(),{type:'create_task',taskId,requestId:taskId,agentId:scenario.startsWith('treasury')?'sage':'atlas',title:'CRE '+scenario,budget:1000,scenario:'success',input:{dataset:'custom-transfers-v1',blockFrom:0,blockTo:10,records:[{block:1,from:'demo.eth',to:'builder.eth',cents:123},{block:2,from:'demo.eth',to:'research.eth',cents:456}]}});
  for(let expectedStep=0;expectedStep<6;expectedStep++)state=await transition(state,{type:'advance',taskId,expectedStep});
  const task=state.tasks[0],bytes=deliveryBytes(task,session.account);
  const artifact=JSON.parse(bytes.artifactText);if(scenario==='invalid-delivery')artifact.output.totalCents++;
  if(scenario==='treasury-detail-tamper'){artifact.output.allocations={'builder.eth':579};artifact.outputHash=resultHash(artifact.output);}
  const artifactText=JSON.stringify(artifact);
  // Only public synthetic test bytes are embedded in these HTTPS endpoint URLs.
  const endpoint=text=>'https://httpbin.org/base64/'+encodeURIComponent(Buffer.from(text).toString('base64'));
  const spec={datasetUrl:endpoint(bytes.datasetText),datasetHash:bytes.datasetHash,artifactUrl:endpoint(artifactText),verification:bytes.verification};
  for(const [url,expected] of [[spec.datasetUrl,bytes.datasetText],[spec.artifactUrl,artifactText]]){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.ok,true,'Public synthetic HTTPS evidence unavailable');assert.equal(await response.text(),expected);}
  const funding=await session.fund(task,spec),config={schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:local.config.escrow,taskId:bytes.id,gasLimit:'500000',spec};
  console.log('CRE dry-run: '+scenario+' (local RPC, synthetic HTTPS, no broadcast).');
  const result=await simulate(config),expected=verifyDelivery(bytes.datasetText,artifactText,bytes.id,spec);
  assert.equal(result.code,0,result.output);assert.match(result.output,/Task commitment verified against finalized chain state/);
  assert.ok(result.output.includes('Delivery consensus: accepted='+expected.accepted+' outputHash='+expected.outputHash));
  assert.match(result.output,/CRE report generated/);assert.match(result.output,/Workflow Simulation Result/);
  const chainStatus=(await session.task(task,spec)).status;assert.equal(chainStatus,'funded','Dry run must not be reported as mined settlement');
  report.cases.push({scenario,config,funding,expected,cli:result,chainStatus,passed:true});
  if(scenario==='invalid-delivery'){
   const mismatch={...config,spec:{...spec,artifactUrl:spec.datasetUrl}},rejected=await simulate(mismatch);
   assert.notEqual(rejected.code,0);assert.match(rejected.output,/Configured specification differs from escrow commitment/);
   assert.ok(!rejected.output.includes('CRE report generated'));
   report.cases.push({scenario:'commitment-mismatch',cli:rejected,passed:true});
  }
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);console.error(report.error);process.exitCode=1;}
finally{await local.close();}
report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/cre-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('CRE simulation evidence: '+path);
