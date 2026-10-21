import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi} from 'viem';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {AgentOSClient} from '../sdk/index.ts';
import {AgentWalletSession,localWalletProvider,inputEvidence} from '../sdk/wallet.ts';
import {AgentVaultClient} from '../sdk/vault.ts';
import {AgentWorkflowClient} from '../sdk/workflows.ts';
import {AgentOrderClient} from '../sdk/orders.ts';
import {escrowABI,tokenABI} from '../sdk/chain.ts';
import {verifyDelivery} from '../cre/workflow/verify.ts';
const runtime=process.env.AGENTOS_TEST_URL&&process.env.AGENTOS_CHAIN_URL?{}:await readFile('.sites-runtime/isolated-demo/current.json','utf8').then(JSON.parse).catch(error=>{if(error.code!=='ENOENT')throw error;return {};});
const base=process.env.AGENTOS_TEST_URL||runtime.baseURL||'http://127.0.0.1:5177',chain=process.env.AGENTOS_CHAIN_URL||runtime.chainURL||'http://127.0.0.1:8545';
for(const url of [base,chain])if(new URL(url).hostname!=='127.0.0.1')throw new Error('Configured workflow demo uses loopback services only.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'configured-workflow-'+id,'x-agentos-queue-only':'1'},os=new AgentOSClient(base,headers),report={id,startedAt:new Date().toISOString(),scope:'actual local HTTP/D1/SDK/queue/EVM; conditional configured workflows, typed nested accepted memory; no public deployment or DON',cases:[]};
const definition=JSON.parse(await readFile(new URL('../examples/skills/treasury-concentration.json',import.meta.url),'utf8'));
try{
 const deployment=await(await fetch(chain+'/config')).json(),wallet=await AgentWalletSession.connect(localWalletProvider(chain),deployment,false),vault=new AgentVaultClient(wallet,base,headers),flows=new AgentWorkflowClient(wallet,base,headers),orders=new AgentOrderClient(wallet,base,headers),initial=await os.workspace(),view=(await vault.sessions()).view,initialBalance=BigInt(view.balance),precision=10n**BigInt(view.decimals),spentCents=Number(BigInt(view.spent)*100n/precision);
 await os.installSkill(definition);const agentRequest=crypto.randomUUID(),agentId='custom-'+agentRequest;await os.registerAgent({name:'Workflow concentration',description:'Rank accepted report allocations',skill:definition.id},agentRequest);await os.updatePolicy({...initial.policy,allowedSkills:[...initial.policy.allowedSkills,definition.id]});
 if(deployment.mode!=='local'||deployment.chainId!==31337)throw new Error('Only the local mock-token deployment is permitted.');
 const buyerBalance=BigInt((await wallet.balances()).token),needed=3000n*precision/100n;if(buyerBalance<needed){const amount=needed-buyerBalance;await wallet.send({to:deployment.token,data:encodeFunctionData({abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[wallet.account,amount]})});report.mockTokenTopup=amount.toString();}
 const session=await vault.authorize({depositCents:3000,perTaskCents:500,totalCents:2500,dailyCents:spentCents+2500,durationSeconds:3600});
 const step=(agentId,source='original',when)=>({agentId,budget:400,input:source==='original'?{from:'original'}:{from:'step',step:source},...(when?{when}:{})});
 const draft={requestId:crypto.randomUUID(),title:'Report → concentration → conditional summary → accepted total',vaultSessionId:session.sessionId,timeoutSeconds:300,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:3,records:[{block:1,from:'treasury',to:'research',cents:123},{block:2,from:'treasury',to:'operations',cents:456},{block:3,from:'treasury',to:'research',cents:100}]},steps:[step('sage'),step(agentId,0),step('atlas',1,{step:1,field:'concentrated',operator:'eq',value:true}),step('sage',2),step('atlas','original',{step:1,field:'concentrated',operator:'eq',value:false}),step('atlas',4)]};
 const created=await flows.create(draft);assert.equal(created.version,'agentos.workflow.v2');assert.equal(created.steps.length,6);assert.equal((await flows.create(draft)).id,created.id);
 // A full committed HTTP response can be discarded; replay must return the same workflow.
 const replay=await fetch(base+'/api/workflows',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'create',...draft,buyer:wallet.account})});assert.equal(replay.status,200);await replay.arrayBuffer();assert.equal((await flows.create(draft)).id,created.id);
 const drain=async()=>{const response=await fetch(base+'/api/runtime/drain',{method:'POST',headers,signal:AbortSignal.timeout(120000)});assert.equal(response.status,200,await response.text());};
 let done;const until=Date.now()+180000;
 while(Date.now()<until){await Promise.all([drain(),drain(),drain()]);done=(await flows.list()).find(w=>w.id===created.id);if(done.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,250));}
 assert.equal(done.status,'completed',JSON.stringify(done));const all=await orders.orders();assert.equal(all.length,4);assert.ok(done.steps[4].skippedAt);assert.ok(done.steps[5].skippedAt);assert.equal(done.steps[4].orderId,undefined);assert.equal(done.steps[5].orderId,undefined);
 for(const order of all){assert.equal(order.settlement.status,'paid');const data=await(await fetch(base+'/api/orders?id='+order.id+'&kind=dataset',{headers})).text(),artifact=await(await fetch(base+'/api/orders?id='+order.id+'&kind=artifact',{headers})).text(),taskId=inputEvidence(order,wallet.account).id;assert.equal(verifyDelivery(data,artifact,taskId,order.spec).accepted,true);const opened=await wallet.client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:taskId},fromBlock:0n});assert.equal(opened.length,1);}
 const ranked=all.find(o=>o.id===done.steps[1].orderId),summary=all.find(o=>o.id===done.steps[2].orderId),final=all.find(o=>o.id===done.steps[3].orderId);assert.equal(ranked.output.concentrated,true);assert.equal(summary.input.memory.projection,'ranked-accounts.v1');assert.equal(final.input.memory.projection,'summary-total.v1');assert.deepEqual(final.output.allocations,{'accepted-summary-total':679});
 const balance=await wallet.client.readContract({address:deployment.token,abi:tokenABI,functionName:'balanceOf',args:[deployment.vault]}),spent=all.reduce((n,o)=>n+o.quote,0);assert.equal(spent,1320);assert.equal(balance,initialBalance+BigInt(3000-spent)*precision/100n);assert.deepEqual((await os.workspace()).ledger,initial.ledger);
 const cross=new AgentWorkflowClient(wallet,base,{'x-agentos-sandbox':'foreign-'+id});assert.equal((await cross.list()).length,0);
 report.cases.push({name:'six configured steps, four exact payments, two skipped purchases, nested accepted projections and response replay',workflow:done,orders:all,spentCents:spent,initialVaultBalance:initialBalance.toString(),finalVaultBalance:balance.toString(),status:'passed'});report.status='passed';console.log('PASS '+report.cases[0].name);
}catch(error){report.status='failed';report.error=error.message;console.error(error.stack);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/configurable-workflow-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Evidence: '+path);}
