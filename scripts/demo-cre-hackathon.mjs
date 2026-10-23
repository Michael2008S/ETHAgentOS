import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {resolve,relative,delimiter} from 'node:path';
import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {createPublicClient,createWalletClient,custom,decodeEventLog,encodePacked,keccak256,stringToHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {startLocalChain} from './local-chain.mjs';
import {compile} from './compile-contracts.mjs';
import {temporaryEvidence} from './temporary-evidence.mjs';
import {retryCREInitialization} from './cre-initialization-retry.mjs';
import {AgentWalletSession,inputEvidence} from '../sdk/wallet.ts';
import {identityABI,reputationABI,completeRegistrationDocument,registrationDataURI} from '../sdk/identity.ts';
import {creWorkflowName,creIdentityHash} from '../sdk/cre-receiver.ts';
import {encodeSettlementReport,tokenABI} from '../sdk/chain.ts';
import {seed,resolveSkillInput} from '../lib/agentos/engine.ts';
import {identityDocument,verifyRegistration,createIdentityChallenge,bindIdentity,inspectIdentity,prepareFeedback,feedbackTransaction,saveFeedbackIntent,verifyFeedback,saveFeedback} from '../lib/agentos/identity.ts';
import {commitWithJobs} from '../lib/agentos/queue.ts';
import {createOrder,findOrder,authorizeOrder,activateOrder,orderArtifact} from '../lib/agentos/orders.ts';
import {runOrder} from '../lib/agentos/order-runner.ts';
import {orderChain} from '../lib/agentos/order-chain.ts';
import {createEvidenceService} from '../lib/agentos/evidence-publisher.ts';
import {specHash,verifyDelivery} from '../cre/workflow/verify.ts';
import {validateConfig} from '../cre/workflow/config.ts';
import {evidenceRoot} from '../cre/workflow/dispatcher.ts';

// Only newly created chain 31337 wallets can write. No Sepolia configuration or key is loaded.
const id=crypto.randomUUID(),root=resolve('outputs/cre-hackathon-'+id),owner='cre-hackathon-'+id;
await mkdir(root+'/workflow',{recursive:true});
const report={id,status:'running',startedAt:new Date().toISOString(),scope:'Official CRE CLI dry-run + disposable local EVM 31337 + persistent local D1 + owned temporary HTTPS synthetic evidence. Local test-forwarder callbacks do not verify DON signatures.',sepolia:{broadcast:false,binding:false,funding:false},cases:[],transactions:[],commands:[],root};
let local,evidence,worker,database,shortDirectory,redactions=[];
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n';
const save=()=>writeFile(root+'/report.json',json(report));
const sha=b=>createHash('sha256').update(b).digest('hex');
const record=(name,details={})=>{report.cases.push({name,status:'passed',...details});console.log('PASS '+name);};
function decodeResult(output){
 const candidates=[output,output.replaceAll('\\"','"')];
 for(const m of output.matchAll(/(?:0x)?([0-9a-fA-F]{100,})/g))candidates.push(Buffer.from(m[1],'hex').toString('utf8'));
 for(const value of candidates){const start=value.indexOf('{"mode":"dispatcher"');if(start<0)continue;for(let end=start;end<value.length;end++)if(value[end]==='}')try{const parsed=JSON.parse(value.slice(start,end+1));if(Array.isArray(parsed.outcomes))return parsed;}catch{}}
 throw Error('Official dispatcher result could not be decoded; inspect CLI log.');
}
async function cli(name,args,key){
 assert.ok(!args.includes('--broadcast'));assert.ok(['build','simulate'].includes(args[1]));
 const command={name,args};report.commands.push(command);await save();
 const run=async attempt=>{
  const result=await new Promise((done,reject)=>{
   const child=spawn(resolve('.sites-runtime/cre-bin/cre'),args,{cwd:root,env:{...process.env,CRE_ETH_PRIVATE_KEY:key,PATH:[resolve('.sites-runtime/cre-tools/node_modules/.bin'),process.env.PATH||''].join(delimiter)},stdio:['ignore','pipe','pipe']});
   let output='';const timer=setTimeout(()=>child.kill('SIGTERM'),180000);
   for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{let s=b.toString();for(const secret of redactions)s=s.split(secret).join('[credential redacted]');output+=s;});
   child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);done({code,output});});
  });await writeFile(root+'/'+name+'-attempt-'+attempt+'.log',result.output);return result;
 };
 const result=await retryCREInitialization(run,{onRetry:n=>console.log('Retry initialization '+name+' '+n)});
 command.exitCode=result.code;command.attempts=result.attempts.length;assert.equal(result.code,0,result.output);return result.output;
}
const databaseOptions={modules:true,script:'export default {fetch(){return new Response("local fixture")}}',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:root+'/d1',host:'127.0.0.1',port:0};
async function openDatabase(){worker=new Miniflare(databaseOptions);database=await worker.getD1Database('DB');}
const store={
 async read(){const row=await database.prepare('SELECT revision,data FROM agentos_workspaces WHERE owner_id=?').bind(owner).first();assert.ok(row);return {state:JSON.parse(row.data),revision:row.revision};},
 async updateWorkspace(_,reduce){for(let n=0;n<12;n++){const {state,revision}=await store.read(),next=await reduce(state);if(JSON.stringify(next)===JSON.stringify(state))return {state,revision};if(await commitWithJobs(database,owner,revision,state,next))return {state:next,revision:revision+1};}throw Error('Local D1 CAS conflict');},
};
async function mutate(reduce){return (await store.updateWorkspace(owner,reduce)).state;}
async function state(){return (await store.read()).state;}

try{
 report.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();report.sourceSHA256={};
 for(const f of ['scripts/demo-cre-hackathon.mjs','scripts/temporary-evidence.mjs','cre/workflow/main.ts','cre/workflow/handler.ts','cre/workflow/config.ts','cre/workflow/dispatcher.ts','cre/workflow/verify.ts','lib/agentos/identity.ts','lib/agentos/orders.ts','lib/agentos/order-runner.ts','contracts/AgentEscrow.sol','contracts/AgentEscrowReceiver.sol','contracts/test/MockCREForwarder.sol'])report.sourceSHA256[f]=sha(await readFile(f));
 console.log('Preparing disposable local EVM and official ERC-8004 registry contracts');
 local=await startLocalChain({port:0});
 const client=createPublicClient({transport:custom(local.provider),cacheTime:0}),signer=createWalletClient({transport:custom(local.provider),chain:null});
 assert.equal(await client.getChainId(),31337);
 async function write(name,address,abi,functionName,args=[],account=local.buyer){
  assert.equal(await client.getChainId(),31337);
  const hash=await signer.writeContract({address,abi,functionName,args,account,gas:6000000n}),receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');
  report.transactions.push({name,chainId:31337,hash,receipt});await save();return receipt;
 }
 const contracts=compile();
 async function deploy(name,args=[]){assert.equal(await client.getChainId(),31337);const hash=await signer.deployContract({...contracts[name],args,account:local.buyer,gas:6000000n}),receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');report.transactions.push({name:'deploy '+name,chainId:31337,hash,receipt});return receipt.contractAddress;}
 const forwarder=await deploy('MockCREForwarder'),workflowName=creWorkflowName('agentos-hackathon-local'),workflowId=keccak256(stringToHex('LOCAL SIMULATION ONLY '+id)),escrow=await deploy('AgentEscrowReceiver',[local.config.token,forwarder,local.config.seller,workflowName]);
 await write('bind synthetic LOCAL workflow',escrow,contracts.AgentEscrowReceiver.abi,'bindWorkflow',[workflowId]);
 const deployment={...local.config,escrow,forwarder,metadataHash:creIdentityHash(workflowName,local.config.seller),receiver:{format:'cre-v1',workflowId,workflowName,workflowOwner:local.config.seller}};
 report.deployment=deployment;report.syntheticLocalWorkflowId=workflowId;await writeFile(root+'/deployment.json',json(deployment));
 const buyer=await AgentWalletSession.connect(local.provider,deployment,false),sellerAddress=local.config.seller;
 assert.notEqual(buyer.account.toLowerCase(),sellerAddress.toLowerCase());
 const key=local.provider.getInitialAccounts()[buyer.account.toLowerCase()].secretKey,sellerKey=local.provider.getInitialAccounts()[sellerAddress.toLowerCase()].secretKey,buyerAccount=privateKeyToAccount(key),sellerAccount=privateKeyToAccount(sellerKey);redactions=[key,key.slice(2),sellerKey,sellerKey.slice(2)];
 await openDatabase();
 for(const f of ['drizzle/0000_parallel_roland_deschain.sql','drizzle/0001_chemical_famine.sql']){const sql=await readFile(f,'utf8');for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())await database.prepare(statement).run();}
 await database.prepare('INSERT INTO agentos_workspaces(owner_id,revision,data) VALUES(?,0,?)').bind(owner,JSON.stringify(seed())).run();
 const origin='http://127.0.0.1',document=await identityDocument(await state(),owner,'atlas',origin);
 const registered=await write('ERC-8004 local registration',deployment.identityRegistry,identityABI,'register',[document.agentURI],sellerAddress);
 const event=registered.logs.filter(l=>l.address.toLowerCase()===deployment.identityRegistry.toLowerCase()).map(l=>{try{return decodeEventLog({abi:identityABI,eventName:'Registered',data:l.data,topics:l.topics}).args;}catch{return null;}}).find(Boolean);assert.ok(event);
 const agentId=event.agentId.toString(),uri=registrationDataURI(completeRegistrationDocument(document.document,31337,deployment.identityRegistry,agentId));
 await write('ERC-8004 complete document',deployment.identityRegistry,identityABI,'setAgentURI',[event.agentId,uri],sellerAddress);
 const identity=await verifyRegistration(await state(),owner,'atlas',agentId,registered.transactionHash,origin,client,deployment),nonce=crypto.randomUUID();
 const challenged=await mutate(s=>createIdentityChallenge(s,owner,identity,nonce)),challenge=challenged.identityChallenges.find(c=>c.nonce===nonce),signature=await sellerAccount.signMessage({message:challenge.message});
 assert.ok(await client.verifyMessage({address:sellerAddress,message:challenge.message,signature}));await mutate(s=>bindIdentity(s,nonce,identity));
 await writeFile(root+'/identity-binding.json',json({identity,challenge,signature}));record('official local ERC-8004 registration, owner signature and D1 identity binding',{agentId,chainId:31337});
 evidence=await temporaryEvidence(escrow,root);redactions.push(evidence.token);
 report.evidence={kind:'temporary owned HTTPS workerd/R2 synthetic data',origin:evidence.origin,namespaceChainId:11155111,actualTransactionChainId:31337};
 const service=createEvidenceService(JSON.stringify({origin:evidence.origin}),evidence.token,{...deployment,mode:'testnet',chainId:11155111}),chain=orderChain(client,deployment,undefined,service.publish,service.complete);
 const config=validateConfig({mode:'dispatcher',schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:escrow,gasLimit:'500000',evidenceOrigin:evidence.origin});report.config=config;
 await writeFile(root+'/project.yaml','staging-settings:\n  rpcs:\n    - chain-name: ethereum-testnet-sepolia\n      url: '+local.base+'/rpc\n');
 await writeFile(root+'/workflow/workflow.yaml','staging-settings:\n  user-workflow:\n    workflow-name: agentos-hackathon-local\n    deployment-registry: "private"\n  workflow-artifacts:\n    workflow-path: '+JSON.stringify(relative(root+'/workflow',resolve('cre/workflow/main.ts')))+'\n    config-path: ./config.json\n    secrets-path: ""\n');await writeFile(root+'/workflow/config.json',json(config));
 console.log('Building current production workflow with official CRE CLI');
 report.cliVersion=execFileSync(resolve('.sites-runtime/cre-bin/cre'),['version'],{encoding:'utf8'}).trim();
 await cli('build',['workflow','build','./workflow','--project-root',root,'--target','staging-settings','--non-interactive','--output',root+'/workflow.wasm'],key);
 report.wasmSHA256=sha(await readFile(root+'/workflow.wasm'));shortDirectory=await mkdtemp('/private/tmp/agentos-hackathon-');const wasmPath=shortDirectory+'/workflow.wasm';await copyFile(root+'/workflow.wasm',wasmPath);
 async function simulate(name){const log=await cli(name,['workflow','simulate','./workflow','--project-root',root,'--target','staging-settings','--wasm',wasmPath,'--trigger-index','0','--non-interactive'],key);const result=decodeResult(log);await writeFile(root+'/'+name+'-result.json',json(result));return {log,result};}
 const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'synthetic-a',to:'synthetic-b',cents:123},{block:2,from:'synthetic-a',to:'synthetic-c',cents:456}]};
 // Funding verification is asynchronous; keep it outside the synchronous activation reducer.
 async function prepareOrder(name,scenario){
  const requestId=crypto.randomUUID(),resolved=resolveSkillInput(await state(),'event-analysis',input),bytes=inputEvidence({id:'chain-'+requestId,input:resolved,skill:'event-analysis'},buyer.account),spec=await service.prepare(bytes),fresh=await inspectIdentity(client,deployment,identity);
  await mutate(s=>createOrder(s,{requestId,title:name,agentId:'atlas',buyer:buyer.account,budget:1000,input:resolved,spec,scenario,timeoutSeconds:1800,agentIdentity:fresh},deployment));
  const order=findOrder(await state(),'chain-'+requestId);await assert.rejects(prepareFeedback(await state(),order.id,90,client,deployment),/identity-bound paid order/);
  const funding=await buyer.fundOrder(order,3600);report.transactions.push({name:'fund '+name,chainId:31337,hash:funding.transactionHash,receipt:await client.getTransactionReceipt({hash:funding.transactionHash})});
  await mutate(async s=>(await authorizeOrder(s,order.id,owner,funding.transactionHash,crypto.randomUUID())).state);const current=findOrder(await state(),order.id),signed=await buyerAccount.signMessage({message:current.authorization.message});assert.ok(await chain.verifySignature(current,current.authorization.message,signed));
  const verified=await chain.funding(current,funding.transactionHash);await mutate(s=>activateOrder(s,order.id,current.authorization.nonce,verified));
  await writeFile(root+'/'+scenario+'-funding-authorization.json',json({message:current.authorization.message,signature:signed,transactionHash:funding.transactionHash}));await runOrder(store,owner,order.id,chain);return order.id;
 }
 const accepted=await prepareOrder('CRE accepted delivery','success'),rejected=await prepareOrder('CRE rejected delivery','invalid-delivery');report.orderIds={accepted,rejected};
 const readyURL=evidence.origin+evidenceRoot('',escrow)+'/ready?slot=0';assert.equal((await(await fetch(readyURL)).json()).total,2);
 const simulation=await simulate('accepted-and-rejected');assert.equal(simulation.result.outcomes.length,2);assert.match(simulation.log,/Task commitment verified against finalized chain state/);assert.match(simulation.log,/CRE report generated/);
 for(const [orderId,expected] of [[accepted,true],[rejected,false]]){
  const order=findOrder(await state(),orderId),bytes=inputEvidence(order,buyer.account),artifact=orderArtifact(order,bytes.id),verdict=verifyDelivery(bytes.datasetText,artifact,bytes.id,order.spec),outcome=simulation.result.outcomes.find(o=>o.taskId===bytes.id);
  assert.equal(verdict.accepted,expected);assert.equal(outcome?.status,'reported');assert.equal(outcome.accepted,expected);assert.equal(outcome.outputHash,verdict.outputHash);assert.equal((await buyer.task(order,order.spec)).status,'funded');
  await writeFile(root+'/'+(expected?'accepted':'rejected')+'-evidence.json',json({order,taskId:bytes.id,inputBytes:bytes.datasetText,artifactBytes:artifact,verdict,officialCLIOutcome:outcome,settlementPayload:encodeSettlementReport(bytes.id,specHash(order.spec),outcome.outputHash,outcome.accepted),payloadOrigin:'ABI encoded from verified official CLI outcome; callback is a separate local test-forwarder transaction'}));
  record((expected?'accepted':'rejected')+' delivery: official CLI consensus/report and dry-run leaves escrow funded',{orderId,taskId:bytes.id,verdict});
 }
 const balance=account=>client.readContract({address:deployment.token,abi:tokenABI,functionName:'balanceOf',args:[account]});
 const metadata=encodePacked(['bytes32','bytes10','address','bytes2'],[workflowId,workflowName,sellerAddress,'0x1234']);
 for(const [orderId,expected] of [[accepted,true],[rejected,false]]){
  const order=findOrder(await state(),orderId),bytes=inputEvidence(order,buyer.account),outcome=simulation.result.outcomes.find(o=>o.taskId===bytes.id),recipient=expected?sellerAddress:buyer.account,before=await balance(recipient),escrowBefore=await balance(escrow);
  const payload=encodeSettlementReport(bytes.id,specHash(order.spec),outcome.outputHash,outcome.accepted),receipt=await write(expected?'local test forwarder payment':'local test forwarder rejection refund',forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata,payload]);
  await runOrder(store,owner,orderId,chain);const done=findOrder(await state(),orderId);assert.equal(done.settlement.status,expected?'paid':'refunded');assert.equal(done.settlement.transactionHash,receipt.transactionHash);
  const amount=BigInt(done.settlement.amount);assert.equal(await balance(recipient)-before,amount);assert.equal(escrowBefore-await balance(escrow),amount);
  await assert.rejects(client.simulateContract({address:forwarder,abi:contracts.MockCREForwarder.abi,functionName:'deliver',args:[escrow,metadata,payload],account:buyer.account}),/terminal or missing task/);
  await runOrder(store,owner,orderId,chain);assert.equal(findOrder(await state(),orderId).settlement.transactionHash,receipt.transactionHash);
  await chain.completeEvidence(done);record(expected?'local payment, exact seller balance and replay rejection':'local rejection refund, exact buyer balance and replay rejection',{orderId,settlement:done.settlement,recipient,before:before.toString(),after:(await balance(recipient)).toString()});
 }
 await assert.rejects(prepareFeedback(await state(),rejected,100,client,deployment),/identity-bound paid order/);record('unpaid/refunded orders cannot prepare paid feedback');
 const intent=await prepareFeedback(await state(),accepted,90,client,deployment);await mutate(s=>saveFeedbackIntent(s,intent));const tx=feedbackTransaction(intent),receipt=await write('paid ERC-8004 feedback',tx.to,reputationABI,'giveFeedback',[BigInt(agentId),90n,0,'starred',intent.tag2,intent.endpoint,intent.feedbackURI,intent.feedbackHash]);
 let feedback=await verifyFeedback(await state(),accepted,receipt.transactionHash,client,deployment);assert.equal(feedback.status,'active');await mutate(s=>saveFeedback(s,feedback));await writeFile(root+'/feedback-active.json',json(feedback));
 const readFeedback=()=>client.readContract({address:deployment.reputationRegistry,abi:reputationABI,functionName:'readFeedback',args:[BigInt(agentId),buyer.account,BigInt(feedback.feedbackIndex)]});assert.equal((await readFeedback())[4],false);assert.equal(JSON.parse(Buffer.from(intent.feedbackURI.split(',')[1],'base64').toString()).proofOfPayment.txHash,findOrder(await state(),accepted).settlement.transactionHash);
 await mutate(async s=>saveFeedback(s,await verifyFeedback(s,accepted,receipt.transactionHash,client,deployment)));assert.equal((await state()).agentFeedback.length,1);record('paid-order feedback matches original local payment and is idempotent',{feedback});
 await assert.rejects(client.simulateContract({address:deployment.reputationRegistry,abi:reputationABI,functionName:'revokeFeedback',args:[BigInt(agentId),BigInt(feedback.feedbackIndex)],account:sellerAddress}));
 const revoked=await write('independent ERC-8004 revocation receipt',deployment.reputationRegistry,reputationABI,'revokeFeedback',[BigInt(agentId),BigInt(feedback.feedbackIndex)]);assert.equal((await readFeedback())[4],true);
 feedback=await verifyFeedback(await state(),accepted,receipt.transactionHash,client,deployment);assert.equal(feedback.status,'revoked');await mutate(s=>saveFeedback(s,feedback));await writeFile(root+'/feedback-revoked.json',json({feedback,revocationTransactionHash:revoked.transactionHash,revocationReceipt:revoked}));record('original buyer revocation confirmed onchain and in D1; another wallet cannot revoke',{revocationTransactionHash:revoked.transactionHash});
 assert.equal((await(await fetch(readyURL)).json()).total,0);const terminal=await simulate('archived-empty-queue');assert.equal(terminal.result.outcomes.length,0);assert.ok(!terminal.log.includes('CRE report generated'));record('archived dispatcher queue produces no second report');
 const snapshot=await store.read();await writeFile(root+'/workspace-final.json',json(snapshot));await worker.dispose();worker=undefined;await openDatabase();assert.deepEqual(await store.read(),snapshot);assert.equal((await state()).agentFeedback.filter(f=>f.status==='active').length,0);record('D1 survives worker restart with paid/refunded orders and revoked feedback');
 assert.equal(await balance(escrow),0n);assert.ok(report.transactions.every(t=>t.chainId===31337));report.final={escrowTokenBalance:'0',activeFeedbackCount:0,queueTotal:0,workspaceRevision:snapshot.revision};report.status='passed';
}catch(error){report.status='failed';report.error=error.stack??error.message;process.exitCode=1;console.error(report.error);}
finally{
 if(evidence)await evidence.close();if(worker)await worker.dispose();if(local)await local.close();if(shortDirectory)await rm(shortDirectory,{recursive:true,force:true});
 report.finishedAt=new Date().toISOString();await save();
 const sums={};async function walk(dir,prefix=''){for(const f of await readdir(dir,{withFileTypes:true})){const rel=prefix+f.name;if(f.isDirectory()){if(!['d1','r2'].includes(f.name))await walk(dir+'/'+f.name,rel+'/');}else if(rel!=='checksums.json')sums[rel]=sha(await readFile(dir+'/'+f.name));}}await walk(root);await writeFile(root+'/checksums.json',json({algorithm:'sha256',files:sums,excluded:'Mutable local D1/R2 storage internals; portable workspace/evidence JSON snapshots are included'}));console.log('Evidence '+root+'/report.json');
}
