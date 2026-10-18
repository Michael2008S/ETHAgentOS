import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { startLocalChain } from './local-chain.mjs';
import { AgentWalletSession,deliveryBytes,localWalletProvider } from '../sdk/wallet.ts';
import { AgentOSClient } from '../sdk/index.ts';

const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('Wallet demo requires a loopback workspace.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'wallet-'+id},os=new AgentOSClient(base,headers),local=await startLocalChain({port:0});
const report={mode:'HTTP local test wallet + web API + EVM',id,cases:[],startedAt:new Date().toISOString()};
async function request(path,body){const r=await fetch(local.base+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.ok,true,JSON.stringify(data));return data;}
try{
 const forbidden=await fetch(local.base+'/config',{headers:{Origin:'https://untrusted.example'}});assert.equal(forbidden.status,403);
 const deniedRPC=await request('/rpc',{jsonrpc:'2.0',id:1,method:'eth_sendTransaction',params:[{from:local.config.seller,to:local.config.token,data:'0x'}]});assert.equal(deniedRPC.error.code,-32602);
 const session=await AgentWalletSession.connect(localWalletProvider(local.base),local.config,false);
 assert.equal((await session.balances()).token,'100000000');
 for(const scenario of ['success','empty-range','rejected','timeout']){
  const created=await os.createTask({agentId:'atlas',title:'Wallet HTTP '+scenario,budget:1000,input:{dataset:'custom-transfers-v1',blockFrom:scenario==='empty-range'?4:0,blockTo:10,records:[{block:3,from:'demo.eth',to:'builder.eth',cents:789}]}}),task=await os.run(created.id),bytes=deliveryBytes(task,session.account);
  for(const [kind,expected] of [['chain-dataset',bytes.datasetText],['chain-artifact',bytes.artifactText]]){
   const response=await fetch(base+'/api/exports?'+new URLSearchParams({kind,taskId:task.id,buyer:session.account}),{headers});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal(await response.text(),expected);
  }
  const spec=await request('/deliveries',bytes),funding=await session.fund(task,spec,60);assert.equal(funding.status,'funded');
  let settled;
  if(scenario==='timeout'){
    const current=await session.task(task,spec);await request('/time',{seconds:Number(current.intent.deadline-(await session.client.getBlock()).timestamp)+1});settled=await session.refund(task);
  }else{
    if(scenario==='rejected')await request('/tamper',{id:bytes.id});
    const verified=await request('/verify',{id:bytes.id});settled=await session.evidence(task,verified.hash,'settlement',spec);
    const replay=await fetch(local.base+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bytes.id})});assert.equal(replay.status,400);
  }
  assert.equal(settled.status,['success','empty-range'].includes(scenario)?'paid':'refunded');
  const reconnected=await AgentWalletSession.connect(localWalletProvider(local.base),local.config,false);
  assert.equal((await reconnected.task(task,spec)).status,settled.status);
  report.cases.push({scenario,taskId:task.id,funding,settlement:settled});console.log('PASS local HTTP wallet → '+scenario+' → '+settled.status);
 }
 assert.equal((await session.balances()).token,'95200000');report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);console.error(report.error);process.exitCode=1;}
finally{await local.close();}
report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/wallet-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Wallet evidence: '+path);
