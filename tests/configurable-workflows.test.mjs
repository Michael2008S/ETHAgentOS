import test from 'node:test';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex} from 'viem';
import {compile} from '../scripts/compile-contracts.mjs';
import {seed,transition,normalizeInput} from '../lib/agentos/engine.ts';
import {findOrder} from '../lib/agentos/orders.ts';
import {createWorkflow,findWorkflow,advanceWorkflow,controlWorkflow} from '../lib/agentos/workflows.ts';
import {workflowRequestSchema} from '../lib/agentos/workflow-schema.ts';
import {futureWorkflowSteps} from '../lib/agentos/workflow-state.ts';
import {runWorkflow} from '../lib/agentos/workflow-runner.ts';
import {orderChain} from '../lib/agentos/order-chain.ts';
import {acceptedArtifact,acceptedArtifactInput,verifyMemoryAuthority,verifyAcceptedOrder} from '../lib/agentos/artifact-memory.ts';
import {inputEvidence} from '../sdk/wallet.ts';
import {escrowABI,encodeSettlementReport} from '../sdk/chain.ts';
import {specHash,verifyDelivery,resultHash,acceptedMemoryRecords} from '../cre/workflow/verify.ts';
import {prepareVaultSession,vaultABI,vaultAllowance} from '../lib/agentos/vault.ts';
import {vaultFunder} from '../lib/agentos/vault-executor.ts';
import {workItems} from '../lib/agentos/queue.ts';

const definition=JSON.parse(readFileSync('examples/skills/treasury-concentration.json','utf8'));
const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:3,records:[{block:1,from:'treasury',to:'a',cents:123},{block:2,from:'treasury',to:'b',cents:456},{block:3,from:'treasury',to:'a',cents:100}]};
async function fixture(){
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller,forwarder,executor]=await wallet.getAddresses(),contracts=compile();
 const write=async(address,abi,functionName,args=[],account=buyer)=>{const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;};
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;
 const token=await deploy('MockToken'),metadata=stringToHex('configurable-workflow-test'),escrow=await deploy('AgentEscrow',[token,forwarder,keccak256(metadata)]),vault=await deploy('AgentVault',[escrow]),deployment={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash:keccak256(metadata),confirmations:1,seller,vault,vaultExecutor:executor,deployedBlock:'0'};
 await write(token,contracts.MockToken.abi,'mint',[vault,1000000000n]);await write(vault,vaultABI,'allowSeller',[seller,true]);await write(vault,vaultABI,'grant',[executor,5000000n,100000000n,(await client.getBlock()).timestamp+3600n]);
 let state=await transition(seed(),{type:'register_skill',definition},new Date().toISOString());state.agents.push({id:'concentration',name:'Concentration',role:'Custom service',description:'Rank accepted allocations',skill:definition.id,price:360,color:'green',enabled:true,identity:'local',createdAt:new Date().toISOString()});state.policy.allowedSkills.push(definition.id);
 const session=await prepareVaultSession(state,'owner',deployment,client,{buyer,perTaskCents:500,totalCents:6000,dailyCents:10000},crypto.randomUUID());session.signature='test fixture signature; session chain binding exercised by funder';state.vaultSessions=[session];
 let writes=Promise.resolve(),revision=0;
 const store={async read(){return {state:structuredClone(state),revision};},updateWorkspace(_,reduce){const run=writes.then(async()=>{state=await reduce(structuredClone(state));revision++;return store.read();});writes=run.catch(()=>{});return run;}};
 const datasets=new Map(),artifacts=new Map(),settlements=new Map();let fundCalls=0,publishes=0;
 const publish=async bytes=>{publishes++;const spec={datasetUrl:'https://data.example/'+bytes.id,artifactUrl:'https://artifact.example/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification};if(datasets.has(bytes.id))assert.deepEqual(datasets.get(bytes.id),{datasetText:bytes.datasetText,spec});datasets.set(bytes.id,{datasetText:bytes.datasetText,spec});return spec;};
 const chain=orderChain(client,deployment,async(path,body)=>{if(path==='/artifacts'){if(artifacts.has(body.id))assert.equal(artifacts.get(body.id),body.artifactText);artifacts.set(body.id,body.artifactText);return {};}
  if(!settlements.has(body.id))settlements.set(body.id,(async()=>{const record=datasets.get(body.id),verdict=verifyDelivery(record.datasetText,artifacts.get(body.id),body.id,record.spec);return {hash:await write(escrow,contracts.AgentEscrow.abi,'onReport',[metadata,encodeSettlementReport(body.id,specHash(record.spec),verdict.outputHash,verdict.accepted)],forwarder)};})());return settlements.get(body.id);});
 const fund=vaultFunder(client,deployment,async(_,data)=>{fundCalls++;const hash=await wallet.sendTransaction({account:executor,to:vault,data,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;});
 const draft=steps=>({requestId:crypto.randomUUID(),title:'Conditional accepted result chain',buyer,vaultSessionId:session.sessionId,steps,timeoutSeconds:300,input});
 async function run(id){for(let i=0;i<8;i++){await Promise.all(Array.from({length:3},()=>runWorkflow(store,'owner',id,chain,publish,{vaultFunder:fund})));if(findWorkflow(state,id).status!=='running')break;}return (await store.read()).state;}
 return {provider,client,buyer,deployment,session,store,publish,chain,fund,draft,run,get state(){return state;},get counts(){return {fundCalls,publishes};}};
}
const step=(agentId,source='original',when)=>({agentId,budget:400,input:source==='original'?{from:'original'}:{from:'step',step:source},...(when?{when}:{})});

test('seven configured steps accept extension outputs, project nested memory, skip false branches, and pay each executed step exactly once',async()=>{
 const f=await fixture();try{
  const steps=[step('sage'),step('concentration',0),step('atlas',1,{step:1,field:'concentrated',operator:'eq',value:true}),step('sage',2),step('atlas','original',{step:1,field:'concentrated',operator:'eq',value:false}),step('atlas',4),step('atlas','original',{step:1,field:'totalCents',operator:'gte',value:679})],draft=f.draft(steps);
  await f.store.updateWorkspace('owner',s=>createWorkflow(s,draft,f.deployment,f.publish));let w=f.state.workflows[0];assert.equal(w.version,'agentos.workflow.v2');assert.equal(w.steps.length,7);assert.equal(futureWorkflowSteps(f.state).length,6);
  assert.equal(await createWorkflow(f.state,draft,f.deployment,f.publish),f.state);
  await assert.rejects(createWorkflow(f.state,{...draft,steps:steps.map((s,i)=>i===2?{...s,when:{...s.when,value:false}}:s)},f.deployment,f.publish),/different parameters/);
  const state=await f.run(w.id);w=findWorkflow(state,w.id);assert.equal(w.status,'completed',w.lastError);assert.equal(state.chainOrders.length,5);assert.equal(f.counts.fundCalls,5);assert.equal(futureWorkflowSteps(state).length,0);assert.equal(workItems(state).filter(j=>j.kind==='workflow').length,0);
  assert.ok(w.steps[4].skippedAt);assert.ok(w.steps[5].skippedAt);assert.equal(w.steps[4].orderId,undefined);assert.equal(w.steps[5].orderId,undefined);
  const orders=w.steps.filter(s=>s.orderId).map(s=>findOrder(state,s.orderId)),ranked=orders[1],summary=orders[2],nested=orders[3];assert.equal(ranked.output.concentrated,true);assert.equal(summary.input.memory.version,'agentos.accepted-artifact.v2');assert.equal(summary.input.memory.projection,'ranked-accounts.v1');assert.equal(nested.input.memory.projection,'summary-total.v1');assert.equal(nested.output.totalCents,679);assert.deepEqual(nested.output.allocations,{'accepted-summary-total':679});assert.equal(nested.input.memory.spec.verification.memoryHash,resultHash(summary.input.memory));
  for(const order of orders){assert.equal(order.settlement.status,'paid');await verifyAcceptedOrder(state,order,f.chain);const bytes=inputEvidence(order,f.buyer),stored=await f.client.getContractEvents({address:f.deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:bytes.id},fromBlock:0n});assert.equal(stored.length,1);}
  const memory=acceptedArtifactInput(nested);assert.deepEqual(normalizeInput(memory),memory);assert.equal(acceptedMemoryRecords(memory.memory)[0].cents,679);
  const forged=structuredClone(memory.memory),artifact=JSON.parse(forged.artifactText);artifact.output.allocations['accepted-summary-total']++;artifact.outputHash=resultHash(artifact.output);forged.artifactText=JSON.stringify(artifact);forged.artifactHash=resultHash(artifact);assert.throws(()=>acceptedMemoryRecords(forged),/complete acceptance/);
  const wrongProjection=structuredClone(summary.input.memory);wrongProjection.projection='summary-total.v1';assert.throws(()=>acceptedMemoryRecords(wrongProjection),/Unsupported/);
  // A reorg of an ancestor is detected even though the direct parent remains paid.
  const ancestor=orders[0],changedChain={...f.chain,settlement:async(order,tx)=>order.id===ancestor.id?{...ancestor.settlement,status:'refunded'}:f.chain.settlement(order,tx)};
  await assert.rejects(verifyMemoryAuthority(state,nested,changedChain),/no longer canonical/);
  const mutated=structuredClone(state);findOrder(mutated,ranked.id).output.concentrated=false;await assert.rejects(verifyAcceptedOrder(mutated,findOrder(mutated,ranked.id),f.chain),/complete acceptance/);
  assert.equal(vaultAllowance(state,f.session.sessionId,f.buyer,'event-analysis',400,240).sessionId,f.session.sessionId);
 }finally{await f.provider.disconnect();}
});

test('rejects forward references, unsupported conditions, missing extension grants and excess steps before publishing or funding',async()=>{
 const f=await fixture();try{
  const valid=[step('sage'),step('concentration',0),step('atlas',1)],invalid=[
   [step('sage',1),step('atlas')],
   [step('sage'),step('atlas',1)],
   [step('sage'),step('atlas',0,{step:1,field:'totalCents',operator:'gte',value:1})],
   [step('sage'),step('atlas',0,{step:0,field:'concentrated',operator:'eq',value:true})],
   [step('concentration'),step('atlas',0,{step:0,field:'concentrated',operator:'gte',value:true})],
   [step('concentration'),step('atlas',0,{step:0,field:'totalCents',operator:'eq',value:true})],
   Array.from({length:9},()=>step('atlas')),
  ];
  for(const steps of invalid)await assert.rejects(createWorkflow(f.state,f.draft(steps),f.deployment,f.publish),/earlier|condition|Invalid workflow/);
  const missing=structuredClone(f.state);missing.vaultSessions[0].skills=missing.vaultSessions[0].skills.filter(s=>s!==definition.id);await assert.rejects(createWorkflow(missing,f.draft(valid),f.deployment,f.publish),/Vault authorization/);
  assert.deepEqual(f.counts,{fundCalls:0,publishes:0});assert.equal(f.state.chainOrders,undefined);
  const request={action:'create',...f.draft(valid)};assert.equal(workflowRequestSchema.safeParse(request).success,true);assert.equal(workflowRequestSchema.safeParse({...request,agentIds:['sage','atlas'],budgets:[400,400]}).success,false);assert.equal(workflowRequestSchema.safeParse({...request,steps:[{...valid[0],shell:'oops'},...valid.slice(1)]}).success,false);
 }finally{await f.provider.disconnect();}
});

test('reserves the entire configured sequence and cancels without creating future purchases',async()=>{
 const f=await fixture();try{
  const steps=[step('sage'),step('concentration',0),step('atlas',1)],draft=f.draft(steps),limited=structuredClone(f.state);limited.vaultSessions[0].totalCents=900;
  await assert.rejects(createWorkflow(limited,draft,f.deployment,f.publish),/total allowance/);
  await f.store.updateWorkspace('owner',s=>createWorkflow(s,draft,f.deployment,f.publish));const w=f.state.workflows[0];assert.equal(w.totalBudget,1200);assert.throws(()=>vaultAllowance({...f.state,vaultSessions:[{...f.session,totalCents:1000}]},f.session.sessionId,f.buyer,'event-analysis',400,240),/total allowance/);
  const cancelled=controlWorkflow(f.state,w.id,'cancel');assert.equal(futureWorkflowSteps(cancelled).length,0);assert.equal(findOrder(cancelled,w.steps[0].orderId).status,'cancelled');assert.equal((await advanceWorkflow(cancelled,w.id,f.chain,f.publish)),cancelled);assert.equal(f.counts.fundCalls,0);
 }finally{await f.provider.disconnect();}
});

test('accepted memory is importable as a standalone SDK dependency without a supplier schema initialization cycle',()=>{
 assert.equal(execFileSync(process.execPath,['--input-type=module','-e',"await import('./lib/agentos/artifact-memory.ts');process.stdout.write('loaded')"],{encoding:'utf8'}),'loaded');
});
