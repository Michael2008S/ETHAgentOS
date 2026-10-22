import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {AgentWalletSession,localWalletProvider,inputEvidence} from '../sdk/wallet.ts';import {AgentVaultClient} from '../sdk/vault.ts';import {AgentOrderClient} from '../sdk/orders.ts';import {tokenABI,escrowABI} from '../sdk/chain.ts';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5187',chain=process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8555';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname)||new URL(chain).hostname!=='127.0.0.1')throw new Error('Use the isolated loopback demo.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'vault-'+id,'x-agentos-queue-only':'1'},report={id,startedAt:new Date().toISOString(),scope:'HTTP/D1 bounded Vault purchasing on local EVM; one signed session',cases:[]};
let signatures=0;
try{
 const deployment=await(await fetch(chain+'/config',{signal:AbortSignal.timeout(10000)})).json();assert.ok(deployment.vault,'Run npm run demo:isolated with the current source.');
 const delegate=localWalletProvider(chain),provider={request:async args=>{if(args.method==='personal_sign')signatures++;return delegate.request(args);}},wallet=await AgentWalletSession.connect(provider,deployment,false),vault=new AgentVaultClient(wallet,base,headers),orders=new AgentOrderClient(wallet,base,headers);
 const initial=await vault.sessions(),precision=BigInt(10)**BigInt(initial.view.decimals),spentCents=Number(BigInt(initial.view.spent)*100n/precision),initialBalance=BigInt(initial.view.balance);
 const session=await vault.authorize({depositCents:2000,perTaskCents:300,totalCents:720,dailyCents:spentCents+720,durationSeconds:3600});assert.equal(signatures,1);
 const original=await(await fetch(base+'/api/workspace',{headers})).json(),ledger=structuredClone(original.state.ledger);
 const post=async(path,body,h=headers)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...h},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});return {status:response.status,body:await response.json()};};
 const cross=await post('/api/vault',{action:'bind',sessionId:session.sessionId,signature:session.signature},{'x-agentos-sandbox':'other-vault-'+id});assert.equal(cross.status,404);report.cases.push({scenario:'signed-workspace-session-and-cross-scope-denial',sessionId:session.sessionId,signatures,crossStatus:cross.status,passed:true});console.log('PASS one signed session; cross-workspace reuse denied');
 for(const scenario of ['success','success','invalid-delivery']){
  const requestId=crypto.randomUUID(),order=await orders.create({requestId,vaultSessionId:session.sessionId,agentId:'atlas',title:'Vault '+scenario,budget:300,scenario,timeoutSeconds:300,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'a',to:'b',cents:123},{block:2,from:'a',to:'c',cents:456}]}});
  const retried=await orders.create({requestId,vaultSessionId:session.sessionId,agentId:'atlas',title:'Vault '+scenario,budget:300,scenario,timeoutSeconds:300,input:order.input});assert.equal(retried.id,order.id);
  let done;const deadline=Date.now()+180000;
  while(Date.now()<deadline){const drained=await post('/api/runtime/drain');assert.equal(drained.status,200,JSON.stringify(drained.body));done=(await orders.orders()).find(o=>o.id===order.id);if(['completed','refunded','cancelled'].includes(done.status))break;await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(done.settlement,JSON.stringify({status:done.status,failure:done.failure,lastError:done.lastError}));assert.equal(done.settlement.status,scenario==='success'?'paid':'refunded');assert.equal(done.funding.buyer.toLowerCase(),deployment.vault.toLowerCase());
  const logs=await wallet.client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:inputEvidence(done,wallet.account).id},fromBlock:0n});assert.equal(logs.length,1);assert.equal(signatures,1);
  report.cases.push({scenario,orderId:done.id,funding:done.funding,settlement:done.settlement,signatures,openedEvents:logs.length,passed:true});console.log('PASS autonomous Vault '+scenario+' → '+done.settlement.status+'; signatures remain '+signatures);
 }
 const balance=await wallet.client.readContract({address:deployment.token,abi:tokenABI,functionName:'balanceOf',args:[deployment.vault]});assert.equal(balance,initialBalance+1520n*precision/100n);report.vaultBalance=balance.toString();report.initialVaultBalance=initialBalance.toString();report.initialDailySpentCents=spentCents;
 await assert.rejects(orders.create({vaultSessionId:session.sessionId,agentId:'atlas',title:'Over session cap',budget:300}),/total allowance/);
 const revocable=await vault.authorize({depositCents:0,perTaskCents:300,totalCents:1000,dailyCents:spentCents+1720,durationSeconds:3600});assert.equal(signatures,2);
 await vault.revoke(revocable.sessionId);const denied=await post('/api/orders',{action:'create',requestId:crypto.randomUUID(),vaultSessionId:revocable.sessionId,buyer:wallet.account,agentId:'atlas',title:'After revocation',budget:300});assert.equal(denied.status,403,JSON.stringify(denied.body));
 const final=await(await fetch(base+'/api/workspace',{headers})).json();assert.deepEqual(final.state.ledger,ledger);assert.equal(final.state.chainOrders.length,3);
 report.cases.push({scenario:'refund-accounting-total-cap-and-revocation',deniedStatus:denied.status,primaryPurchaseSignatures:1,totalSignaturesIncludingSeparateRevocationGrant:signatures,orders:final.state.chainOrders.length,passed:true});
 report.status='passed';console.log('PASS refund to Vault, non-replenished cap, revoked session denied, sandbox ledger unchanged');
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/vault-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Evidence: '+path);}
