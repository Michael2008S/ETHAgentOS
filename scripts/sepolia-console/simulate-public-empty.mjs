import assert from 'node:assert/strict';import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,relative,delimiter} from 'node:path';import {spawn} from 'node:child_process';
import {generatePrivateKey} from 'viem/accounts';import {createPublicClient,http,parseAbi} from 'viem';
import {temporaryEvidence} from '../temporary-evidence.mjs';import {validateConfig} from '../../cre/workflow/config.ts';
const root=resolve('outputs/erc8004-sepolia-2026-10-23/public-preparation/empty-https-dry-run-'+crypto.randomUUID());await mkdir(root+'/workflow',{recursive:true});
const deployment=JSON.parse(await readFile('outputs/erc8004-sepolia-2026-10-23/deployment-unbound.json','utf8')),client=createPublicClient({transport:http('https://ethereum-sepolia-rpc.publicnode.com',{timeout:20000,retryCount:1})}),abi=parseAbi(['function workflowId() view returns(bytes32)']);
const before=await client.readContract({address:deployment.escrow,abi,functionName:'workflowId'});assert.equal(before,'0x'+'0'.repeat(64));assert.equal(await client.getChainId(),11155111);
let fixture;const report={status:'running',scope:'official CRE CLI dry-run, temporary HTTPS empty evidence queue and independently read public Sepolia unbound state; no DON deployment, task, report or transaction',root,broadcast:false,persistentPublicEvidenceService:false};
try{
 fixture=await temporaryEvidence(deployment.escrow,root);
 const config=validateConfig({mode:'dispatcher',schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:deployment.escrow,gasLimit:'500000',evidenceOrigin:fixture.origin});
 const ready=await fetch(fixture.origin+'/v1/11155111/'+deployment.escrow+'/ready?slot=0').then(r=>r.json());assert.equal(ready.total,0);
 await writeFile(root+'/project.yaml','staging-settings:\n  rpcs:\n    - chain-name: ethereum-testnet-sepolia\n      url: https://ethereum-sepolia-rpc.publicnode.com\n');
 await writeFile(root+'/workflow/workflow.yaml','staging-settings:\n  user-workflow:\n    workflow-name: agentos-delivery-staging\n  workflow-artifacts:\n    workflow-path: '+JSON.stringify(relative(root+'/workflow',resolve('cre/workflow/main.ts')))+'\n    config-path: ./config.json\n    secrets-path: ""\n');await writeFile(root+'/workflow/config.json',JSON.stringify(config,null,2));
 await copyFile('outputs/agentos-cli.wasm',root+'/workflow.wasm');
 const ephemeral=generatePrivateKey(),args=['workflow','simulate','./workflow','--project-root',root,'--target','staging-settings','--wasm',root+'/workflow.wasm','--trigger-index','0','--non-interactive'];assert.ok(!args.includes('--broadcast'));
 const result=await new Promise((done,reject)=>{const child=spawn(resolve('.sites-runtime/cre-bin/cre'),args,{cwd:root,env:{...process.env,CRE_ETH_PRIVATE_KEY:ephemeral,PATH:[resolve('.sites-runtime/cre-tools/node_modules/.bin'),process.env.PATH||''].join(delimiter)},stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGTERM'),120000);for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString().split(ephemeral).join('[ephemeral simulator key redacted]').split(fixture.token).join('[temporary writer token redacted]');});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);done({code,output});});});
 await writeFile(root+'/simulation.log',result.output);assert.equal(result.code,0,result.output);assert.ok(!result.output.includes('CRE report generated'));assert.match(result.output,/dispatcher/);assert.match(result.output,/(?:outcomes|6f7574636f6d6573)/);
 const after=await client.readContract({address:deployment.escrow,abi,functionName:'workflowId'});assert.equal(after,before);
 Object.assign(report,{status:'passed',config,ready,cliExitCode:result.code,workflowIdBefore:before,workflowIdAfter:after,transactions:[],temporaryServiceClosedOnExit:true});console.log('PASS official CRE empty-queue HTTPS dry-run; Sepolia receiver remains unbound.');
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{if(fixture)await fixture.close();report.finishedAt=new Date().toISOString();await writeFile(root+'/report.json',JSON.stringify(report,null,2));console.log('Evidence '+root+'/report.json');}
