import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,dirname,delimiter} from 'node:path';
import {createPublicClient,createWalletClient,custom,encodePacked,keccak256,stringToHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {startLocalChain} from './local-chain.mjs';
import {compile} from './compile-contracts.mjs';
import {temporaryEvidence} from './temporary-evidence.mjs';
import {AgentWalletSession,inputEvidence} from '../sdk/wallet.ts';
import {creWorkflowName,creIdentityHash} from '../sdk/cre-receiver.ts';
import {encodeSettlementReport} from '../sdk/chain.ts';
import {createEvidenceService} from '../lib/agentos/evidence-publisher.ts';
import {orderChain} from '../lib/agentos/order-chain.ts';
import {createOrder,findOrder,authorizeOrder,activateOrder,orderArtifact} from '../lib/agentos/orders.ts';
import {runOrder} from '../lib/agentos/order-runner.ts';
import {seed,transition,resolveSkillInput} from '../lib/agentos/engine.ts';
import { resultHash, specHash, verifyDelivery } from '../cre/workflow/verify.ts';
import {evidenceRoot} from '../cre/workflow/dispatcher.ts';

const id=crypto.randomUUID(),root=resolve('.sites-runtime/cre-dispatcher/'+id),report={id,startedAt:new Date().toISOString(),scope:'official CLI dry-run with real temporary HTTPS/workerd/R2 and local EVM 31337; Sepolia selector alias; callbacks use a local test forwarder; no broadcast, registration or DON attestation',cases:[]};
let local,evidence;
try{
 await mkdir(root+'/workflow',{recursive:true});local=await startLocalChain({port:0,identity:false});
 const signer=createWalletClient({transport:custom(local.provider),chain:null}),client=createPublicClient({transport:custom(local.provider),cacheTime:0}),contracts=compile(),buyer=local.buyer;
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await signer.deployContract({...contracts[name],account:buyer,args,gas:6000000n})})).contractAddress;
 const write=async(address,abi,functionName,args=[])=>{const hash=await signer.writeContract({address,abi,functionName,args,account:buyer,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash;};
 const forwarder=await deploy('MockCREForwarder'),workflowName=creWorkflowName('agentos-dispatcher-simulation'),workflowId=keccak256(stringToHex('synthetic test identity '+id)),escrow=await deploy('AgentEscrowReceiver',[local.config.token,forwarder,local.config.seller,workflowName]);await write(escrow,contracts.AgentEscrowReceiver.abi,'bindWorkflow',[workflowId]);
 const deployment={...local.config,escrow,forwarder,metadataHash:creIdentityHash(workflowName,local.config.seller),receiver:{format:'cre-v1',workflowId,workflowName,workflowOwner:local.config.seller}},wallet=await AgentWalletSession.connect(local.provider,deployment,false);
 evidence=await temporaryEvidence(escrow,root);
 // The service namespace/CRE selector is Sepolia; every actual transaction stays on local chain 31337.
 const service=createEvidenceService(JSON.stringify({origin:evidence.origin}),evidence.token,{...deployment,mode:'testnet',chainId:11155111}),access=orderChain(client,deployment,undefined,service.publish,service.complete),key=local.provider.getInitialAccounts()[buyer.toLowerCase()].secretKey,account=privateKeyToAccount(key);
 let state=seed();const store={read:async()=>({state:structuredClone(state)}),updateWorkspace:async(_,reduce)=>{state=await reduce(state);return {state:structuredClone(state)};}};
 const config={mode:'dispatcher',schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:escrow,gasLimit:'500000',evidenceOrigin:evidence.origin},configHash=resultHash(config);
 await writeFile(root+'/project.yaml','staging-settings:\n  rpcs:\n    - chain-name: ethereum-testnet-sepolia\n      url: '+local.base+'/rpc\n');
 await writeFile(root+'/workflow/workflow.yaml','staging-settings:\n  user-workflow:\n    workflow-name: agentos-dispatcher-simulation\n  workflow-artifacts:\n    workflow-path: '+JSON.stringify(resolve('cre/workflow/main.ts'))+'\n    config-path: ./config.json\n    secrets-path: ""\n');await writeFile(root+'/workflow/config.json',JSON.stringify(config,null,2));
 const cli=process.env.AGENTOS_CRE_BIN||(existsSync('.sites-runtime/cre-bin/cre')?resolve('.sites-runtime/cre-bin/cre'):'cre'),bun=process.env.AGENTOS_BUN_BIN?dirname(resolve(process.env.AGENTOS_BUN_BIN)):resolve('.sites-runtime/cre-tools/node_modules/.bin'),env={...process.env,CRE_ETH_PRIVATE_KEY:key,PATH:[bun,process.env.PATH||''].join(delimiter)};
 async function simulate(name){
  console.log('CRE dispatcher dry-run: '+name);
  const result=await new Promise((done,reject)=>{const child=spawn(cli,['workflow','simulate','./workflow','--project-root',root,'--target','staging-settings','--wasm',resolve('outputs/agentos-cli.wasm'),'--trigger-index','0','--non-interactive'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';const timer=setTimeout(()=>child.kill('SIGTERM'),120000);for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString().split(key).join('[ephemeral key redacted]').split(evidence.token).join('[writer credential redacted]');});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);done({code,output});});});
  await writeFile(root+'/'+name+'.log',result.output);assert.equal(result.code,0,result.output);assert.equal(resultHash(config),configHash);return result;
 }
 async function prepare(name,agentId,scenario='success'){
  const requestId=crypto.randomUUID(),input=resolveSkillInput(state,state.agents.find(a=>a.id===agentId).skill,{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'synthetic-treasury',to:'synthetic-research',cents:123},{block:2,from:'synthetic-treasury',to:'synthetic-operations',cents:456}]}),bytes=inputEvidence({id:'chain-'+requestId,input,skill:state.agents.find(a=>a.id===agentId).skill},buyer),spec=await service.prepare(bytes);
  state=await createOrder(state,{requestId,title:name,agentId,buyer,budget:1000,input,spec,scenario,timeoutSeconds:300},deployment);const order=state.chainOrders[0],funding=await wallet.fundOrder(order,3600);state=(await authorizeOrder(state,order.id,'temporary-dispatcher-demo',funding.transactionHash,crypto.randomUUID())).state;const authorized=findOrder(state,order.id);assert.equal(await access.verifySignature(authorized,authorized.authorization.message,await account.signMessage({message:authorized.authorization.message})),true);state=activateOrder(state,order.id,authorized.authorization.nonce,await access.funding(authorized,funding.transactionHash));return order.id;
 }
 const first=await prepare('Correct dispatcher delivery','atlas'),wrong=await prepare('Rejected dispatcher delivery','sage','invalid-delivery');
 const ready=async()=>{const response=await fetch(evidence.origin+evidenceRoot('',escrow)+'/ready?slot=0');assert.equal(response.status,200);return response.json();};assert.equal((await ready()).total,0,'funding alone does not publish a ready artifact');
 for(const orderId of [first,wrong])await runOrder(store,'temporary-dispatcher-demo',orderId,access);assert.equal((await ready()).total,2);
 const initial=await simulate('two-ready-orders');for(const orderId of [first,wrong]){const order=findOrder(state,orderId),bytes=inputEvidence(order,buyer),verdict=verifyDelivery(bytes.datasetText,orderArtifact(order,bytes.id),bytes.id,order.spec);assert.ok(initial.output.includes('Delivery consensus: accepted='+verdict.accepted+' outputHash='+verdict.outputHash),initial.output);assert.equal((await wallet.task(order,order.spec)).status,'funded','dry-run cannot be counted as mined payment');}
 report.cases.push({name:'two-ready-orders',configHash,cli:initial,chainStatus:'funded after dry-run',passed:true});
 const metadata=encodePacked(['bytes32','bytes10','address','bytes2'],[workflowId,workflowName,local.config.seller,'0x1234']);
 async function localCallback(orderId){const order=findOrder(state,orderId),bytes=inputEvidence(order,buyer),verdict=verifyDelivery(bytes.datasetText,orderArtifact(order,bytes.id),bytes.id,order.spec),hash=await write(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata,encodeSettlementReport(bytes.id,specHash(order.spec),verdict.outputHash,verdict.accepted)]);await runOrder(store,'temporary-dispatcher-demo',orderId,access);const done=findOrder(state,orderId);assert.equal(done.settlement.transactionHash,hash);return {order:done,verdict};}
 for(const orderId of [first,wrong]){const {order,verdict}=await localCallback(orderId);assert.equal(order.settlement.status,verdict.accepted?'paid':'refunded');report.cases.push({name:'local test callback only',orderId:order.id,settlement:order.settlement,passed:true});}
 const terminal=await simulate('terminal-not-yet-archived');assert.ok(!terminal.output.includes('CRE report generated'),terminal.output);report.cases.push({name:'terminal-not-yet-archived',configHash,cli:terminal,passed:true});
 for(const orderId of [first,wrong])await access.completeEvidence(findOrder(state,orderId));assert.equal((await ready()).total,0);
 const later=await prepare('New order with unchanged dispatcher','sage');await runOrder(store,'temporary-dispatcher-demo',later,access);const next=await simulate('new-order-same-config'),laterOrder=findOrder(state,later),laterBytes=inputEvidence(laterOrder,buyer),verdict=verifyDelivery(laterBytes.datasetText,orderArtifact(laterOrder,laterBytes.id),laterBytes.id,laterOrder.spec);assert.ok(next.output.includes('Delivery consensus: accepted=true outputHash='+verdict.outputHash),next.output);assert.equal((await wallet.task(laterOrder,laterOrder.spec)).status,'funded');report.cases.push({name:'new-order-same-config',configHash,cli:next,passed:true});
 const {order}=await localCallback(later);await access.completeEvidence(order);assert.equal((await ready()).total,0);
 const definition=JSON.parse(await readFile(new URL('../examples/skills/treasury-concentration.json',import.meta.url),'utf8'));
 state=await transition(state,{type:'register_skill',definition});state=await transition(state,{type:'register_agent',requestId:'dispatcher-extension',agent:{name:'Dispatcher concentration',description:'Data-only extension skill',skill:definition.id}});state=await transition(state,{type:'update_policy',policy:{...state.policy,allowedSkills:[...state.policy.allowedSkills,definition.id]}});
 const extensionGood=await prepare('New skill accepted by unchanged dispatcher','custom-dispatcher-extension'),extensionBad=await prepare('New skill rejected by unchanged dispatcher','custom-dispatcher-extension','invalid-delivery');
 for(const orderId of [extensionGood,extensionBad])await runOrder(store,'temporary-dispatcher-demo',orderId,access);
 const extended=await simulate('new-skill-same-config');
 for(const orderId of [extensionGood,extensionBad]){const o=findOrder(state,orderId),bytes=inputEvidence(o,buyer),verdict=verifyDelivery(bytes.datasetText,orderArtifact(o,bytes.id),bytes.id,o.spec);assert.ok(extended.output.includes('Delivery consensus: accepted='+verdict.accepted+' outputHash='+verdict.outputHash),extended.output);assert.equal((await wallet.task(o,o.spec)).status,'funded');const {order}=await localCallback(orderId);await access.completeEvidence(order);report.cases.push({name:'extension local test callback only',orderId,skill:definition.id,settlement:order.settlement,passed:true});}
 report.cases.push({name:'new-skill-same-config',configHash,definition,cli:extended,passed:true});assert.equal((await ready()).total,0);assert.equal(resultHash(config),configHash);report.config=config;report.syntheticWorkflowId=workflowId;report.status='passed';console.log('PASS same dispatcher configuration, correct/rejected/new orders and extension skills, terminal skip and retained immutable evidence.');
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{if(evidence)await evidence.close();if(local)await local.close();report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/cre-dispatcher-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('CRE dispatcher evidence: '+path);}
