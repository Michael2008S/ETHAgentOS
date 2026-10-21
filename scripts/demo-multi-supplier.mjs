import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {encodeFunctionData,parseAbi} from 'viem';
import {AgentOSClient} from '../sdk/index.ts';
import {AgentWalletSession,localWalletProvider,inputEvidence} from '../sdk/wallet.ts';
import {AgentIdentityClient} from '../sdk/agent-identity.ts';
import {AgentOrderClient} from '../sdk/orders.ts';
import {AgentVaultClient} from '../sdk/vault.ts';
import {escrowABI,tokenABI} from '../sdk/chain.ts';
import {vaultABI} from '../lib/agentos/vault.ts';
import {supplierRequest,supplierJobId,verifySupplierDelivery} from '../lib/agentos/supplier.ts';
import {orderSeller} from '../lib/agentos/order-parties.ts';
const runtime=process.env.AGENTOS_TEST_URL&&process.env.AGENTOS_CHAIN_URL&&process.env.AGENTOS_SUPPLIER_URL?{}:await readFile('.sites-runtime/isolated-demo/current.json','utf8').then(JSON.parse).catch(error=>{if(error.code!=='ENOENT')throw error;return {};});
const base=process.env.AGENTOS_TEST_URL||runtime.baseURL||'http://127.0.0.1:5177',chain=process.env.AGENTOS_CHAIN_URL||runtime.chainURL||'http://127.0.0.1:8545',primary=process.env.AGENTOS_SUPPLIER_URL||runtime.supplierURL||'http://127.0.0.1:7461',secondary=process.env.AGENTOS_SECOND_SUPPLIER_URL||runtime.supplier2URL||'http://127.0.0.1:'+(Number(new URL(primary).port)+1);
for(const value of [base,chain,primary,secondary])if(!value||new URL(value).hostname!=='127.0.0.1')throw new Error('Multi-supplier demo requires a two-provider isolated loopback runtime.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'multi-supplier-'+id,'x-agentos-queue-only':'1'},os=new AgentOSClient(base,headers),report={id,startedAt:new Date().toISOString(),scope:'actual local HTTP/D1/SDK/queue, two independent supplier journals/signers, two ERC-8004 owners and payment wallets, local EVM; no public deployment/DON; automatic provider failover remains separate',cases:[]};
const get=async(path)=>{const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
const control=async(url,mode)=>{const r=await fetch(url+'/testing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});assert.equal(r.status,200);};
const stats=async(url)=>(await fetch(url+'/stats')).json();
let ready=false;
try{
 const deployment=await(await fetch(chain+'/config')).json();if(deployment.mode!=='local'||deployment.chainId!==31337)throw new Error('Only the ephemeral local chain is permitted.');
 const buyer=await AgentWalletSession.connect(localWalletProvider(chain),deployment,false),sellerA=await AgentWalletSession.connect(localWalletProvider(chain,'seller'),deployment,false),sellerB=await AgentWalletSession.connect(localWalletProvider(chain,'seller2'),deployment,false),orders=new AgentOrderClient(buyer,base,headers),vault=new AgentVaultClient(buyer,base,headers),catalog=await get('/api/suppliers'),descriptors=catalog.descriptors;
 assert.equal(descriptors.length,2);assert.notEqual(descriptors[0].signer,descriptors[1].signer);assert.notEqual(sellerA.account,sellerB.account);ready=true;await control(primary,'healthy');await control(secondary,'healthy');
 const initial=await os.workspace(),agentIds=[];
 for(const [index,seller] of [sellerA,sellerB].entries()){
  const requestId=crypto.randomUUID(),agentId='custom-'+requestId;agentIds.push(agentId);await os.registerAgent({name:index===0?'Provider Alpha':'Provider Beta',description:'Independent payment destination and delivery signer',skill:'event-analysis'},requestId);await os.updateAgent(agentId,{enabled:true,price:index===0?300:200});const identities=new AgentIdentityClient(seller,base,headers);await identities.registerAndBind(agentId);const identity=(await os.workspace()).agentIdentities.find(i=>i.agentId===agentId);assert.equal(identity.wallet.toLowerCase(),seller.account.toLowerCase());await identities.authorizeSupplier(identity,descriptors[index]);
 }
 const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury',to:'research',cents:123},{block:2,from:'treasury',to:'operations',cents:456}]},draft=(i,title)=>({agentId:agentIds[i],supplierId:descriptors[i].id,executor:'supplier',title,budget:500,input});
 await assert.rejects(orders.create({...draft(0,'Wrong supplier denied'),supplierId:descriptors[1].id}),/not authorized/);assert.equal((await orders.orders()).length,0);
 const balances=async()=>Promise.all([sellerA.account,sellerB.account].map(address=>buyer.client.readContract({address:deployment.token,abi:tokenABI,functionName:'balanceOf',args:[address]}))),before=await balances();
 const walletBalance=BigInt((await buyer.balances()).token);if(walletBalance<50000000n){await buyer.send({to:deployment.token,data:encodeFunctionData({abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[buyer.account,50000000n-walletBalance]})});}
 async function check(order,index){assert.equal(order.settlement.status,'paid');assert.equal(orderSeller(order).toLowerCase(),[sellerA,sellerB][index].account.toLowerCase());assert.equal(order.settlement.seller.toLowerCase(),orderSeller(order).toLowerCase());await verifySupplierDelivery(order.supplierDelivery,await supplierRequest(order));const logs=await buyer.client.getContractEvents({address:deployment.escrow,abi:escrowABI,eventName:'Opened',args:{id:inputEvidence(order,buyer.account).id},fromBlock:0n});assert.equal(logs.length,1);}
 for(const index of [0,1]){let order=await orders.create(draft(index,'Manual '+index));const funded=await buyer.fundOrder(order,300);await orders.activate(order,funded);order=await orders.sync(order.id);assert.equal(order.status,'completed');await check(order,index);report.cases.push({name:'manual independent provider '+index,order,status:'passed'});}
 const view=(await vault.sessions()).view,spent=Number(BigInt(view.spent)*100n/10n**BigInt(view.decimals));
 const single=await vault.authorize({depositCents:1000,perTaskCents:500,totalCents:1000,dailyCents:spent+5000,durationSeconds:3600});await assert.rejects(orders.create({...draft(1,'Unapproved extra seller denied'),vaultSessionId:single.sessionId}),/does not permit this seller/);
 const session=await vault.authorize({depositCents:0,perTaskCents:500,totalCents:1500,dailyCents:spent+5000,durationSeconds:3600,sellers:[sellerB.account]});assert.ok(session.sellers.includes(sellerB.account.toLowerCase()));assert.ok(session.sellers.includes(sellerA.account.toLowerCase()));
 let stalled=await orders.create({...draft(1,'Provider Beta outage stays on Beta'),vaultSessionId:session.sessionId});const other=await orders.create({...draft(0,'Provider Alpha continues independently'),vaultSessionId:session.sessionId});
 await control(secondary,'outage');const primaryBefore=(await stats(primary)).jobs;await assert.rejects(orders.sync(stalled.id),/checkpoint retained|unavailable/i);stalled=(await orders.orders()).find(o=>o.id===stalled.id);assert.ok(!stalled.settlement);assert.equal(stalled.supplier.id,descriptors[1].id);assert.equal((await stats(primary)).jobs,primaryBefore,'no silent reroute to the other signer/payee');
 const healthy=await orders.sync(other.id);assert.equal(healthy.status,'completed');await check(healthy,0);
 await control(secondary,'healthy');const recovered=await orders.sync(stalled.id);assert.equal(recovered.status,'completed');await check(recovered,1);assert.ok((await stats(secondary)).requests[supplierJobId(await supplierRequest(recovered))]>=2);
 report.cases.push({name:'bounded multi-seller Vault, isolated supplier outage and original provider recovery without duplicate funding',singleSellerSession:single.sessionId,multiSellerSession:session,healthyOrder:healthy,recoveredOrder:recovered,status:'passed'});
 await assert.rejects(orders.create({...draft(1,'Changed supplier on replay'),requestId:recovered.requestId,supplierId:descriptors[0].id,vaultSessionId:session.sessionId}),/different supplier/);
 await buyer.send({to:deployment.vault,data:encodeFunctionData({abi:vaultABI,functionName:'allowSeller',args:[sellerB.account,false]})});await assert.rejects(orders.create({...draft(1,'Revoked payee denied'),vaultSessionId:session.sessionId}),/revoked/);
 const after=await balances();assert.equal(after[0]-before[0],6000000n);assert.equal(after[1]-before[1],4000000n);assert.deepEqual((await os.workspace()).ledger,initial.ledger);assert.equal((await orders.orders()).length,4);
 const cross=new AgentOrderClient(buyer,base,{'x-agentos-sandbox':'foreign-'+id});assert.equal((await cross.orders()).length,0);
 report.cases.push({name:'registry payee balances, signed seller-set denial, revocation, immutable supplier replay and owner isolation',before:before.map(String),after:after.map(String),status:'passed'});report.status='passed';for(const c of report.cases)console.log('PASS '+c.name);
}catch(error){report.status='failed';report.error=error.stack;console.error(error.stack);process.exitCode=1;}
finally{if(ready){await control(primary,'healthy').catch(()=>{});await control(secondary,'healthy').catch(()=>{});}report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/multi-supplier-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Evidence: '+path);}
