import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { AgentWalletSession,localWalletProvider,inputEvidence } from '../sdk/wallet.ts';
import { AgentOrderClient } from '../sdk/orders.ts';
import { escrowABI } from '../sdk/chain.ts';
import { keccak256,stringToHex } from 'viem';
const baseURL=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',localBase=(process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname))throw new Error('Pre-funded demo requires a loopback workspace.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'prefund-'+id},report={id,mode:'pre-funded HTTP wallet + server runtime + D1 + actual EVM',startedAt:new Date().toISOString(),cases:[]};
async function local(path,body){const r=await fetch(localBase+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const b=await r.json();assert.equal(r.ok,true,JSON.stringify(b));return b;}
async function post(body,h=headers){const r=await fetch(baseURL+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
try{
 const session=await AgentWalletSession.connect(localWalletProvider(localBase),await local('/config'),false),os=new AgentOrderClient(session,baseURL,headers),balance=BigInt((await session.balances()).token);
 const original=await fetch(baseURL+'/api/workspace',{headers}),ledger=structuredClone((await original.json()).state.ledger);
 for(const scenario of ['success','injection','invalid-delivery','interruption','expired-before-activation']){
  const draft=await os.create({requestId:crypto.randomUUID(),agentId:'atlas',title:'Pre-funded '+scenario,budget:1000,scenario:scenario==='expired-before-activation'?'success':scenario,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:0,from:'treasury.eth',to:'ignored.eth',cents:9999},{block:1,from:'treasury.eth',to:'builder.eth',cents:123},{block:2,from:'treasury.eth',to:'research.eth',cents:456}]}});
  assert.equal(draft.status,'awaiting-funding');assert.equal(draft.output,null);await os.sync(draft.id);assert.equal((await os.orders()).find(o=>o.id===draft.id).output,null);
  const earlyExport=await fetch(baseURL+'/api/orders?'+new URLSearchParams({id:draft.id,kind:'artifact'}),{headers});assert.equal(earlyExport.status,404);
  assert.equal((await fetch(draft.spec.artifactUrl)).status,404);
  const funding=await session.fundOrder(draft,120);assert.equal((await os.orders()).find(o=>o.id===draft.id).status,'awaiting-funding');assert.equal((await fetch(draft.spec.artifactUrl)).status,404);
  const bad=await post({action:'challenge',orderId:draft.id,transactionHash:funding.transactionHash});assert.equal(bad.status,200);
  const denied=await post({action:'activate',orderId:draft.id,nonce:bad.body.order.authorization.nonce,signature:'0x'+'00'.repeat(65)});assert.equal(denied.status,403,JSON.stringify(denied.body));
  const cross=await post({action:'challenge',orderId:draft.id,transactionHash:funding.transactionHash},{'x-agentos-sandbox':'other-'+id});assert.equal(cross.status,404);
  if(scenario==='expired-before-activation')await local('/time',{seconds:121});
  await os.activate(draft,funding);let done=await os.wait(draft.id);
  assert.equal(done.settlement.status,['success','interruption'].includes(scenario)?'paid':'refunded');assert.equal(done.output?.totalCents,scenario==='success'||scenario==='interruption'?579:scenario==='invalid-delivery'?580:undefined);
  assert.ok(done.events.findIndex(e=>e.title==='Escrow funding confirmed')<done.events.findIndex(e=>e.title==='Artifact generated')||!done.output);
  const hash=done.settlement.transactionHash;
  await Promise.all(Array.from({length:5},()=>os.sync(draft.id,hash)));
  const logs=await session.client.getContractEvents({address:session.deployment.escrow,abi:escrowABI,eventName:'Settled',args:{id:inputEvidence(draft,session.account).id},fromBlock:BigInt(funding.blockNumber)});assert.equal(logs.length,1);
  if(scenario==='interruption'){assert.equal(done.status,'paused');done=await os.resume(draft.id);assert.equal(done.status,'completed');assert.equal(done.settlement.transactionHash,hash);}
  const exported=await fetch(baseURL+'/api/orders?'+new URLSearchParams({id:draft.id}),{headers});assert.match(exported.headers.get('content-disposition'),/^attachment;/);assert.equal((await exported.json()).order.settlement.transactionHash,hash);
  const exportedData=await fetch(baseURL+'/api/orders?'+new URLSearchParams({id:draft.id,kind:'dataset'}),{headers});assert.equal(keccak256(stringToHex(await exportedData.text())),draft.spec.datasetHash);
  const exportedArtifact=await fetch(baseURL+'/api/orders?'+new URLSearchParams({id:draft.id,kind:'artifact'}),{headers});assert.equal((await exportedArtifact.json()).taskId,inputEvidence(draft,session.account).id);
  const otherExport=await fetch(baseURL+'/api/orders?'+new URLSearchParams({id:draft.id}),{headers:{'x-agentos-sandbox':'other-'+id}});assert.equal(otherExport.status,404);
  const workspace=await fetch(baseURL+'/api/workspace',{headers}),state=(await workspace.json()).state;assert.deepEqual(state.ledger,ledger);assert.equal(state.chainReceipts.filter(r=>r.webTaskId===draft.id).length,1);
  report.cases.push({scenario,order:done,settledEvents:logs.length,sandboxLedgerUnchanged:true});console.log('PASS pre-funded '+scenario+' -> '+done.status+' -> '+done.settlement.status);
 }
 assert.equal(BigInt((await session.balances()).token),balance-4800000n);report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);console.error(report.error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/prefund-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Pre-funded evidence: '+path);}
