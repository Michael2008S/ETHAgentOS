import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { AgentOSClient } from '../sdk/index.ts';
import { AgentWalletSession,deliveryBytes,localWalletProvider } from '../sdk/wallet.ts';
import { reconcileReceipt } from '../sdk/reconciliation.ts';

const baseURL=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',localBase=(process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545');
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(baseURL).hostname))throw new Error('Reconciliation demo requires a loopback workspace.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'reconcile-'+id},os=new AgentOSClient(baseURL,headers),report={id,mode:'server verified EVM receipts + wallet challenge + D1 CAS',cases:[],startedAt:new Date().toISOString()};
async function local(path,body){const r=await fetch(localBase+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.ok,true,JSON.stringify(data));return data;}
async function post(body,customHeaders=headers){const r=await fetch(baseURL+'/api/chain',{method:'POST',headers:{...customHeaders,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
try{
 const session=await AgentWalletSession.connect(localWalletProvider(localBase),await local('/config'),false),options={baseURL,headers};
 for(const scenario of ['paid','rejected','timeout']){
  await local('/time',{seconds:1});
  const created=await os.createTask({agentId:'atlas',title:'Reconciliation '+scenario,budget:1000}),task=await os.run(created.id),ledger=structuredClone((await os.workspace()).ledger),bytes=deliveryBytes(task,session.account),spec=await local('/deliveries',bytes),funding=await session.fund(task,spec,60);
  const initial=await reconcileReceipt(session,task.id,funding,spec,options);assert.equal(initial.evidence.status,'funded');
  await Promise.all(Array.from({length:3},()=>reconcileReceipt(session,task.id,funding,spec,options)));
  assert.equal((await os.workspace()).chainReceipts.filter(r=>r.evidence.transactionHash===funding.transactionHash).length,1);
  let settlement;
  if(scenario==='timeout'){
   const current=await session.task(task,spec);await local('/time',{seconds:Number(current.intent.deadline-(await session.client.getBlock()).timestamp)+1});settlement=await session.refund(task);
  }else{
   if(scenario==='rejected')await local('/tamper',{id:bytes.id});
   const verified=await local('/verify',{id:bytes.id});settlement=await session.evidence(task,verified.hash,'settlement',spec);
  }
  const saved=await reconcileReceipt(session,task.id,settlement,spec,options);assert.equal(saved.evidence.status,scenario==='paid'?'paid':'refunded');
  const workspace=await os.workspace();assert.equal(workspace.chainReceipts.filter(r=>r.webTaskId===task.id).length,2);assert.deepEqual(workspace.ledger,ledger);
  const claim={taskId:task.id,buyer:session.account,chainId:31337,escrow:session.deployment.escrow,transactionHash:settlement.transactionHash,phase:'settlement',spec};
  const issued=await post({action:'challenge',claim});assert.equal(issued.status,200,JSON.stringify(issued.body));
  const {challenge}=issued.body,signature=await session.signReconciliation(challenge.message);
  const concurrent=await Promise.all(Array.from({length:5},()=>post({action:'reconcile',nonce:challenge.nonce,signature})));for(const response of concurrent)assert.equal(response.status,200,JSON.stringify(response.body));
  const cross=await post({action:'reconcile',nonce:challenge.nonce,signature},{'x-agentos-sandbox':'other-'+id});assert.equal(cross.status,404);
  const wrongSignature=await post({action:'reconcile',nonce:challenge.nonce,signature:'0x'+'00'.repeat(65)});assert.equal(wrongSignature.status,403,JSON.stringify(wrongSignature.body));
  const forged=await post({action:'reconcile',nonce:challenge.nonce,signature,evidence:{status:'paid'}});assert.equal(forged.status,400);
  const wrongNetwork=await post({action:'challenge',claim:{...claim,chainId:1}});assert.equal(wrongNetwork.status,403);
  const origin=await fetch(baseURL+'/api/chain',{method:'POST',headers:{...headers,Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({action:'reconcile',nonce:challenge.nonce,signature})});assert.equal(origin.status,403);
  const context=await fetch(baseURL+'/api/exports?'+new URLSearchParams({kind:'context',taskId:task.id}),{headers});assert.equal((await context.json()).chainReceipts.length,2);
  const query=new URLSearchParams({q:settlement.transactionHash,format:'export'}),memory=await fetch(baseURL+'/api/memory?'+query,{headers}),result=await memory.json();assert.equal(result.total,1);assert.equal(result.items[0].chainReceipts.length,2);
  report.cases.push({scenario,webTaskId:task.id,funding:initial,settlement:saved,concurrentReplays:5,workspaceLedgerUnchanged:true});console.log('PASS server reconciliation: '+scenario+'; signature, replay, workspace isolation, evidence export');
 }
 const history=await fetch(baseURL+'/api/exports?kind=chain-receipts',{headers});assert.match(history.headers.get('content-disposition'),/^attachment;/);assert.equal((await history.json()).receipts.length,6);
 const other=await fetch(baseURL+'/api/exports?kind=chain-receipts',{headers:{'x-agentos-sandbox':'other-'+id}});assert.equal((await other.json()).receipts.length,0);
 report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);console.error(report.error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/reconciliation-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Reconciliation evidence: '+path);}
