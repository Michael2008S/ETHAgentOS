import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {AgentWalletSession,localWalletProvider} from '../sdk/wallet.ts';
import {AgentVaultClient} from '../sdk/vault.ts';
import {AgentIdentityClient} from '../sdk/agent-identity.ts';
import {AgentOrderClient} from '../sdk/orders.ts';
import {checkX402Policy,x402PolicyHash} from '../lib/agentos/x402-policy.ts';
import {verifyX402Evidence,verifyX402Payment} from '../lib/agentos/x402-evidence.ts';
import {supplierRequest} from '../lib/agentos/supplier.ts';
import {escrowABI,tokenABI} from '../sdk/chain.ts';
import {vaultABI} from '../lib/agentos/vault.ts';
import {dataRpc} from '../lib/agentos/chain-data.ts';
import {USDC_ADDRESS,TRANSFER_TOPIC} from '../lib/agentos/transfer-source.ts';
import {AgentConsumerClient} from '../sdk/consumers.ts';

const id=crypto.randomUUID(),directory=resolve('outputs/x402-demo-'+id);await mkdir(directory,{recursive:true});
const live=process.argv.includes('--live'),report={id,startedAt:new Date().toISOString(),scope:'local HTTP + D1 + EVM, '+(live?'live finalized read-only USDC':'captured finalized USDC')+' source, official x402 v2 exact/EIP-3009; no public deployment or DON',cases:[]},at=process.argv.indexOf('--runtime');let runtime,child;
async function start(){
 if(at>=0){runtime=JSON.parse(await readFile(process.argv[at+1],'utf8'));assert.equal(runtime.x402,true);assert.equal(runtime.capturedSource,!live,'Choose --live for an existing live-source runtime.');return;}
 const env={...process.env,AGENTOS_DEMO_X402:'1',AGENTOS_DEMO_NO_CURRENT:'1',AGENTOS_DEMO_CAPTURED_SOURCE:live?'0':'1',AGENTOS_DEMO_SOURCE_PROXY:live?'1':'0',AGENTOS_DEMO_WEB_PORT:process.env.AGENTOS_X402_DEMO_WEB_PORT||(live?'18877':'16877'),AGENTOS_DEMO_CHAIN_PORT:process.env.AGENTOS_X402_DEMO_CHAIN_PORT||(live?'18897':'16897'),AGENTOS_DEMO_SUPPLIER_PORT:process.env.AGENTOS_X402_DEMO_SUPPLIER_PORT||(live?'18907':'16907')};
 child=spawn(process.execPath,['scripts/demo-isolated.mjs'],{env,stdio:['ignore','pipe','pipe']});let log='',errorLog='',finished=false;child.stdout.on('data',chunk=>{const text=chunk.toString();log+=text;for(const line of text.split('\n'))if(line.startsWith('READY '))console.log(line);for(const line of log.split('\n'))if(line.startsWith('ISOLATED DEMO '))runtime=JSON.parse(line.slice(14));});child.stderr.on('data',chunk=>{errorLog+=chunk.toString();});child.on('exit',()=>{finished=true;});
 const end=Date.now()+600000;while(!runtime){if(finished||Date.now()>end)throw Error('x402 runtime failed: '+errorLog.slice(-1000));await new Promise(ok=>setTimeout(ok,500));}
 await writeFile(directory+'/runtime-start.log',log+errorLog);console.log('READY isolated x402 runtime '+runtime.baseURL);
}
async function request(base,path,body,headers={}){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body==null?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)}),value=await response.json();return {status:response.status,value};}
try{
 await start();report.runtime=runtime;report.sourceSnapshot=JSON.parse(await readFile(runtime.root+'/source.json','utf8'));
 const base=runtime.baseURL,chain=runtime.chainURL,headers={'x-agentos-sandbox':'x402-'+id,'x-agentos-queue-only':'1'},deployment=(await request(chain,'/config')).value,wallet=await AgentWalletSession.connect(localWalletProvider(chain),deployment,false),seller=await AgentWalletSession.connect(localWalletProvider(chain,'seller2'),deployment,false),identities=new AgentIdentityClient(seller,base,headers),orders=new AgentOrderClient(wallet,base,headers),vault=new AgentVaultClient(wallet,base,headers),catalog=await request(base,'/api/suppliers',undefined,headers);
 assert.equal(catalog.status,200,JSON.stringify(catalog.value));const descriptor=catalog.value.descriptors.find(s=>s.id==='local-x402-treasury');assert.ok(descriptor);const policy=await checkX402Policy(catalog.value.x402Policies[descriptor.id],descriptor.revision),review={policyHash:await x402PolicyHash(policy),discloseInput:true};
 await identities.registerAndBind('sage');const snapshot=(await request(base,'/api/workspace',undefined,headers)).value;
 await identities.authorizeSupplier(snapshot.state.agentIdentities.find(i=>i.agentId==='sage'),descriptor);
 const balance=address=>wallet.client.readContract({address:deployment.token,abi:tokenABI,functionName:'balanceOf',args:[address]}),before=await balance(deployment.vault),sellerBefore=await balance(seller.account),merchantBefore=await balance(policy.payTo);
 const initialVaultView=(await vault.sessions()).view,initialGross=BigInt(initialVaultView.spent),initialSpentCents=Number(initialGross*100n/10n**BigInt(initialVaultView.decimals));
 const session=await vault.authorize({depositCents:500,perTaskCents:100,totalCents:300,dailyCents:initialSpentCents+300,durationSeconds:3600,sellers:[seller.account]});
 let account,block;
 if(live){const rpc=dataRpc(process.env.AGENTOS_DATA_RPC_URL||'https://ethereum-rpc.publicnode.com'),finalized=await rpc('eth_getBlockByNumber',['finalized',false]),logs=await rpc('eth_getLogs',[{address:USDC_ADDRESS,fromBlock:finalized.number,toBlock:finalized.number,topics:[TRANSFER_TOPIC]}]);assert.ok(logs.length,'No USDC transfers in this finalized block; retry on a later block.');account='0x'+logs[0].topics[2].slice(-40);block=Number(BigInt(finalized.number));}
 else{const capture=JSON.parse(await readFile(new URL('../tests/fixtures/usdc-finalized-capture.json',import.meta.url),'utf8'));account='0x'+capture.logs[0].topics[2].slice(-40);block=capture.logs[0].blockNumber;}
 const imported=await request(base,'/api/data',{account,direction:'incoming',blockFrom:block,blockTo:block},headers);assert.equal(imported.status,200,JSON.stringify(imported.value));const input=imported.value.input;report.dataSource={mode:runtime.sourceMode,account,block,source:input.source};
 const draft={agentId:'sage',title:'x402 USDC treasury report',budget:100,input,executor:'supplier',supplierId:descriptor.id,vaultSessionId:session.sessionId,timeoutSeconds:300,x402Review:review};
 await assert.rejects(orders.create({...draft,x402Review:undefined}),/reviewed x402/);report.cases.push({name:'unreviewed input refused before funding',passed:true});
 const completed=[];let payer,payerStart;
 for(const mode of ['healthy','wrong-result','lost-response']){
  assert.equal((await request(runtime.x402ReportURL,'/testing',{mode})).status,200);const order=mode==='healthy'&&!live?await (await import('./x402/browser-check.mjs')).createX402BrowserOrder({base,headers,input,sourceAccount:account,block,sessionId:session.sessionId,title:'x402 '+mode}):await orders.create({...draft,requestId:crypto.randomUUID(),title:'x402 '+mode});assert.equal((await orders.create({...draft,requestId:order.requestId,title:'x402 '+mode})).id,order.id);
  const deadline=Date.now()+180000;let done;
  while(Date.now()<deadline){const drain=await request(base,'/api/runtime/drain',null,headers);assert.equal(drain.status,200,JSON.stringify(drain.value));done=(await orders.orders()).find(o=>o.id===order.id);if(done.settlement)break;await new Promise(ok=>setTimeout(ok,300));}
  assert.equal(done.settlement?.status,mode==='wrong-result'?'refunded':'paid',JSON.stringify({status:done.status,lastError:done.lastError,failure:done.failure,events:done.events}));
  const evidence=await request(base,'/api/orders/evidence?id='+done.id,undefined,headers);assert.equal(evidence.status,200,JSON.stringify(evidence.value));const x402=await verifyX402Evidence(evidence.value.x402,await supplierRequest(done),policy);await verifyX402Payment(wallet.client,x402);assert.ok(x402.terms.report);assert.ok(evidence.value.freshChecks.some(c=>c.id==='x402 payment and report'&&c.status==='verified'));
  if(!payer){payer=x402.terms.payer;payerStart=await balance(payer)+BigInt(x402.terms.amount);}
  assert.equal((await request(base,'/api/orders/evidence?id='+done.id,undefined,{'x-agentos-sandbox':'other-'+id})).status,404);
  for(const eventName of ['Opened','Settled'])assert.equal((await wallet.client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName,args:{id:done.funding.taskId},fromBlock:0n})).length,1);
  if(mode==='wrong-result'){assert.equal(done.output,null);assert.match(done.failure,/independent recomputation/);}
  completed.push(done);report.cases.push({name:mode,order:done,x402,passed:true});console.log('PASS x402 '+mode+' → '+done.settlement.status);
 }
 await assert.rejects(orders.create({...draft,title:'Over gross session cap'}),/total allowance/);
 assert.equal(await balance(deployment.vault),before+3000000n);assert.equal(await balance(seller.account)-sellerBefore,2000000n);assert.equal(await balance(policy.payTo)-merchantBefore,600000n);assert.equal(payerStart-await balance(payer),600000n);
 const spent=await wallet.client.readContract({address:deployment.vault,abi:vaultABI,functionName:'spent',args:[deployment.vaultExecutor,(await wallet.client.getBlock()).timestamp/86400n]});assert.equal(spent-initialGross,3000000n);
 const final=(await request(base,'/api/workspace',undefined,headers)).value;assert.deepEqual(final.state.ledger,snapshot.state.ledger);assert.equal(final.state.chainOrders.filter(o=>!o.settlement).length,0);
 const {DatabaseSync}=await import('node:sqlite'),journal=new DatabaseSync(runtime.root+'/x402/procurement.sqlite',{readOnly:true});let purchases;try{purchases=journal.prepare("SELECT data FROM records WHERE namespace='purchases'").all().map(r=>JSON.parse(r.data));}finally{journal.close();}const reserved=purchases.filter(r=>!r.payment&&r.state!=='unpaid').reduce((n,r)=>n+BigInt(r.amount),0n);assert.equal(reserved,0n);const gas=(await request(runtime.x402FacilitatorURL,'/gas')).value;assert.equal(gas.reservedWei,'0');assert.ok(BigInt(gas.spentWei)>0n);report.gas={...gas,unit:'native ETH wei',payer:'independent facilitator',chargedToUserEscrow:false};
 const manager=new AgentConsumerClient(base,headers),credential=await manager.issue({name:'x402 evidence isolation check',ttlSeconds:3600,intervalMs:1000});
 try{assert.equal((await request(base,'/api/orders/evidence?id='+completed[0].id,undefined,{'x-agentos-consumer-token':credential.token})).status,403);const exported=await request(base,'/api/orders?id='+completed[0].id,undefined,headers),publicText=JSON.stringify(exported.value)+JSON.stringify(report.cases);for(const row of purchases)if(row.payload)assert.equal(publicText.includes(row.payload.payload.signature),false,'raw upstream payment authorization must remain private');}finally{await manager.revoke(credential.credential.id);}
 report.cases.push({name:'consumer denied procurement evidence; raw payment authorizations absent from owner exports',passed:true});
 report.accounting={units:'DemoUSDC base units (6 decimals)',funded:'3000000',paid:'2000000',refunded:'1000000',unsettled:'0',userNetSpend:'2000000',upstreamSpend:'600000',procurementReserved:reserved.toString(),supplierTokenMargin:'1400000',grossVaultDailySpent:spent.toString(),grossVaultDailyIncrease:(spent-initialGross).toString(),sandboxLedgerUnchanged:true};report.cases.push({name:'complete reconciliation, session cap stays consumed after refund, no unsettled orders',passed:true});
 report.browser=await (await import('./x402/browser-check.mjs')).checkX402Browser({base,headers,directory,orderId:completed[0].id});report.browser.creationMode=live?'API with live finalized input':'browser with captured finalized input';assert.equal((await orders.orders()).length,3,'browser refresh must not create a new purchase');report.status='passed';console.log('PASS x402 accounting: user funded 3.00 = paid 2.00 + refunded 1.00; supplier upstream 0.60');
}catch(error){report.status='failed';report.error=error.stack??String(error);console.error(report.error);process.exitCode=1;}
finally{
 if(runtime)await request(runtime.x402ReportURL,'/testing',{mode:'healthy'}).catch(()=>{});
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(ok=>child.once('close',ok));}
 report.finishedAt=new Date().toISOString();await writeFile(directory+'/report.json',JSON.stringify(report,null,2));console.log('x402 demo evidence: '+directory+'/report.json');
}
