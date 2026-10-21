import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient,createWalletClient,custom,decodeEventLog,keccak256,parseAbi,stringToHex } from 'viem';
import { compile } from '../scripts/compile-contracts.mjs';
import {deployIdentityRegistries} from '../scripts/compile-identity.mjs';
import {identityDocument,verifyRegistration} from '../lib/agentos/identity.ts';
import {identityABI,completeRegistrationDocument,registrationDataURI} from '../sdk/identity.ts';
import { AgentWalletSession,inputEvidence } from '../sdk/wallet.ts';
import { encodeSettlementReport,escrowABI } from '../sdk/chain.ts';
import { specHash,verifyDelivery } from '../cre/workflow/verify.ts';
import { privateKeyToAccount,generatePrivateKey } from 'viem/accounts';
import { createSupplier } from '../lib/agentos/supplier.ts';
import { seed,DomainError } from '../lib/agentos/engine.ts';
import { activateOrder,authorizeOrder,createOrder,findOrder } from '../lib/agentos/orders.ts';
import { orderChain } from '../lib/agentos/order-chain.ts';
import { runOrder } from '../lib/agentos/order-runner.ts';
import { createModelPlanner,parseModelConfiguration } from '../lib/agentos/model.ts';

test('pre-funded runtime executes only after escrow, pays once, refunds rejection/revocation/expiry and resumes paid checkpoints',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),signer=createWalletClient({transport:custom(provider),chain:null});
 const [buyer,seller,forwarder]=await signer.getAddresses(),contracts=compile();
 async function write(address,abi,functionName,args=[],account=buyer){const hash=await signer.writeContract({address,abi,functionName,args,account,gas:6000000n});await client.waitForTransactionReceipt({hash});return hash;}
 async function deploy(name,args=[]){return(await client.waitForTransactionReceipt({hash:await signer.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;}
 let state=seed(),writes=Promise.resolve(),failSettlementCommit=false;const store={read:async()=>({state:structuredClone(state)}),updateWorkspace:(_,reduce)=>{const result=writes.then(async()=>{const next=await reduce(state);if(failSettlementCommit&&next.chainOrders?.some(o=>o.settlement&&!state.chainOrders?.find(p=>p.id===o.id)?.settlement)){failSettlementCommit=false;throw new Error("Simulated D1 failure after mined payment");}state=next;return {state:structuredClone(state)};});writes=result.catch(()=>{});return result;}};
 const specifications=new Map(),data=new Map(),artifacts=new Map(),transactions=new Map();
 try{
  const token=await deploy('MockToken'),metadata=stringToHex('order-test'),escrow=await deploy('AgentEscrow',[token,forwarder,keccak256(metadata)]),deployment={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash:keccak256(metadata),confirmations:1,seller,deployedBlock:'0'};
  await write(token,contracts.MockToken.abi,'mint',[buyer,100000000n]);let wallet=await AgentWalletSession.connect(provider,deployment,false);const ledger=structuredClone(state.ledger);
  const access=orderChain(client,deployment,async(path,body)=>{
   if(path==='/artifacts'){if(artifacts.has(body.id))assert.equal(artifacts.get(body.id),body.artifactText);artifacts.set(body.id,body.artifactText);return {};}
   if(!transactions.has(body.id))transactions.set(body.id,(async()=>{
    const current=await client.readContract({address:escrow,abi:escrowABI,functionName:'tasks',args:[body.id]});
    if((await client.getBlock()).timestamp>=current[3])return {hash:await write(escrow,escrowABI,'refundExpired',[body.id])};
    const verdict=verifyDelivery(data.get(body.id),artifacts.get(body.id),body.id,specifications.get(body.id));
    return {hash:await write(escrow,parseAbi(['function onReport(bytes,bytes)']),'onReport',[metadata,encodeSettlementReport(body.id,current[4],verdict.outputHash,verdict.accepted)],forwarder)};
   })());return transactions.get(body.id);
  });
  function specHashValue(id){return keccak256(stringToHex(data.get(id)));}
  async function draft(scenario='success',model,supplier,identity){
   const requestId=crypto.randomUUID(),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:0,from:'x',to:'ignored',cents:999},{block:1,from:'x',to:'a',cents:123},{block:2,from:'x',to:'b',cents:456}]},bytes=inputEvidence({id:'chain-'+requestId,input,skill:'event-analysis'},buyer),spec={datasetUrl:'https://data.example/'+bytes.id,artifactUrl:'https://artifact.example/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification};
   specifications.set(bytes.id,spec);data.set(bytes.id,bytes.datasetText);state=await createOrder(state,{requestId,title:'Pre-funded '+scenario,agentId:'atlas',budget:1000,buyer,input,spec,scenario,timeoutSeconds:300,...(model?{planner:'llm',model}:{} ),...(supplier?{executor:'supplier',supplier,agentIdentity:identity}:{})},deployment);return state.chainOrders[0];
  }
  async function fund(order){const evidence=await wallet.fundOrder(order,120);state=(await authorizeOrder(state,order.id,'owner',evidence.transactionHash,crypto.randomUUID())).state;const current=await access.funding(findOrder(state,order.id),evidence.transactionHash);state=activateOrder(state,order.id,findOrder(state,order.id).authorization.nonce,current);return evidence;}
  const first=await draft();await runOrder(store,'owner',first.id,access);assert.equal(findOrder(state,first.id).output,null);assert.equal(artifacts.size,0);assert.equal(findOrder(state,first.id).status,'awaiting-funding');
  const funded=await fund(first);assert.equal(findOrder(state,first.id).output,null);failSettlementCommit=true;
  await Promise.all(Array.from({length:3},()=>runOrder(store,'owner',first.id,access)));
  let done=findOrder(state,first.id);assert.equal(done.status,'completed');assert.equal(done.output.totalCents,579);assert.equal(done.settlement.status,'paid');assert.equal(transactions.size,1);assert.equal(state.chainReceipts.length,1);assert.deepEqual(state.ledger,ledger);
  await assert.rejects(wallet.fundOrder(first),/already exists/);
  for(const scenario of ['injection','invalid-delivery','interruption']){
   const order=await draft(scenario);await fund(order);await runOrder(store,'owner',order.id,access);done=findOrder(state,order.id);assert.equal(done.settlement.status,scenario==='interruption'?'paid':'refunded');assert.equal(done.status,scenario==='interruption'?'paused':'refunded');
   const count=transactions.size,receipt=done.settlement.transactionHash;await runOrder(store,'owner',order.id,access);assert.equal(transactions.size,count);assert.equal(findOrder(state,order.id).settlement.transactionHash,receipt);
  }
  const revoked=await draft();await fund(revoked);state.policy.active=false;await runOrder(store,'owner',revoked.id,access);done=findOrder(state,revoked.id);assert.equal(done.output,null);assert.equal(done.settlement.status,'refunded');assert.match(done.failure,/revoked/);state.policy.active=true;
  const expired=await draft();await fund(expired);await provider.request({method:'evm_increaseTime',params:[121]});await provider.request({method:'evm_mine',params:[]});await runOrder(store,'owner',expired.id,access);done=findOrder(state,expired.id);assert.equal(done.output,null);assert.equal(done.settlement.status,'refunded');assert.deepEqual(state.ledger,ledger);
  const recovery=await draft();await fund(recovery);const unavailable={...access,inspect:async()=>{throw new Error('private RPC credential must not leak');}};const failed=await runOrder(store,'owner',recovery.id,unavailable);assert.equal(failed.status,'retryable');assert.equal(findOrder(state,recovery.id).output,null);assert.equal(findOrder(state,recovery.id).lastError.includes('credential'),false);await runOrder(store,'owner',recovery.id,access);assert.equal(findOrder(state,recovery.id).status,'completed');assert.equal(findOrder(state,recovery.id).lastError,undefined);
  assert.equal((await wallet.balances()).token,'92800000');
  // Controlled model responses exercise the actual EVM refund and concurrency paths.
  const modelConfig=parseModelConfiguration({url:'https://model.example/v1/chat/completions',model:'controlled-test',revision:'1'});let calls=0;
  const planner=await createModelPlanner(modelConfig,undefined,async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"operations":["dataset.read","artifact.write"]}'}}]}));});
  const planned=await draft('success',planner.descriptor);await fund(planned);await Promise.all(Array.from({length:3},()=>runOrder(store,'owner',planned.id,access,{planner})));await runOrder(store,'owner',planned.id,access,{planner});
  assert.equal(calls,1);assert.equal(findOrder(state,planned.id).settlement.status,'paid');assert.equal(findOrder(state,planned.id).output.totalCents,579);
  for(const kind of ['forbidden','unavailable']){
   const badPlanner=await createModelPlanner(modelConfig,undefined,async()=>{if(kind==='unavailable')throw new Error('provider-secret');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"operations":["wallet.transfer"]}'}}]}));});
   const badOrder=await draft('success',badPlanner.descriptor);await fund(badOrder);await runOrder(store,'owner',badOrder.id,access,{planner:badPlanner});const rejected=findOrder(state,badOrder.id);
   assert.equal(rejected.settlement.status,'refunded');assert.equal(rejected.output,null);assert.equal(rejected.failure.includes('provider-secret'),false);assert.deepEqual(state.ledger,ledger);
  }
  assert.equal((await wallet.balances()).token,'90400000');
  // Controlled supplier transport, actual EVM settlement: a persisted signed output
  // must settle without contacting the supplier again; final authority can deny it.
  const supplierAccount=privateKeyToAccount(generatePrivateKey());let supplierCalls=0,authority=true;
  const supplierModule=await import('../lib/agentos/supplier.ts'),engine=await import('../lib/agentos/engine.ts');
  const authorize=async()=>{if(!authority)throw new DomainError('Supplier delegation revoked.','SUPPLIER_REJECTED');};
  const supplier=await createSupplier(supplierModule.parseSupplierConfiguration({url:'https://skills.example/v1/execute',id:'controlled',name:'Controlled supplier',revision:'1',signer:supplierAccount.address,skills:['event-analysis']}),authorize,undefined,async(_,init)=>{
   supplierCalls++;const request=JSON.parse(init.body),output={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,transferCount:2,totalCents:579,uniqueRecipients:2},payload={version:'agentos.skill-delivery.v1',requestHash:await engine.digest(request),configHash:request.supplier.configHash,jobId:supplierModule.supplierJobId(request),outputHash:await engine.digest(output),output,issuedAt:new Date().toISOString()};return Response.json({payload,signature:await supplierAccount.signMessage({message:supplierModule.supplierReceiptMessage(payload)})});
  });
  Object.assign(deployment,await deployIdentityRegistries(client,signer,buyer));wallet=await AgentWalletSession.connect(provider,deployment,false);
  const identityDraft=await identityDocument(state,'owner','atlas','http://localhost'),registrationHash=await write(deployment.identityRegistry,identityABI,'register',[identityDraft.agentURI],seller),registrationReceipt=await client.getTransactionReceipt({hash:registrationHash}),registered=registrationReceipt.logs.map(log=>{try{return decodeEventLog({abi:identityABI,eventName:'Registered',data:log.data,topics:log.topics}).args;}catch{return null;}}).find(Boolean),registryAgentId=String(registered.agentId);
  await write(deployment.identityRegistry,identityABI,'setAgentURI',[BigInt(registryAgentId),registrationDataURI(completeRegistrationDocument(identityDraft.document,31337,deployment.identityRegistry,registryAgentId))],seller);
  const realIdentity=await verifyRegistration(state,'owner','atlas',registryAgentId,registrationHash,'http://localhost',client,deployment),setDelegation=value=>write(deployment.identityRegistry,identityABI,'setMetadata',[BigInt(registryAgentId),supplierModule.SUPPLIER_METADATA_KEY,value],seller);await setDelegation(supplierModule.supplierMetadata(supplier.descriptor));
  for(const revoked of [false,true]){
   const external=await draft('success',undefined,supplier.descriptor,realIdentity);if(!revoked){const balance=(await wallet.balances()).token;await setDelegation('0x');await assert.rejects(wallet.fundOrder(external),/not authorized/);assert.equal((await wallet.balances()).token,balance);const logs=await client.getContractEvents({address:escrow,abi:escrowABI,eventName:'Opened',args:{id:inputEvidence(external,buyer).id},fromBlock:0n});assert.equal(logs.length,0);await setDelegation(supplierModule.supplierMetadata(supplier.descriptor));}await fund(external);await runOrder(store,'owner',external.id,access,{supplier,maxSteps:3});assert.equal(findOrder(state,external.id).step,3);assert.ok(findOrder(state,external.id).supplierDelivery);const beforeCalls=supplierCalls;authority=!revoked;
   await runOrder(store,'owner',external.id,access,{supplierAuthority:authorize});assert.equal(supplierCalls,beforeCalls);assert.equal(findOrder(state,external.id).settlement.status,revoked?'refunded':'paid');authority=true;
  }
  assert.equal((await wallet.balances()).token,'88000000');

 }finally{await provider.disconnect();}
});
