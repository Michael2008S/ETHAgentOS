import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { encodeFunctionData,parseAbi } from 'viem';
import { AgentWalletSession,localWalletProvider } from '../sdk/wallet.ts';
import { AgentOrderClient } from '../sdk/orders.ts';
import { AgentIdentityClient } from '../sdk/agent-identity.ts';
import { identityABI,reputationABI } from '../sdk/identity.ts';
const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177',local='http://127.0.0.1:8545';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Identity demo requires a loopback workspace.');
const id=crypto.randomUUID(),headers={'x-agentos-sandbox':'identity-'+id},report={id,mode:'official ERC-8004 registries + HTTP wallets + D1 + paid EVM order',startedAt:new Date().toISOString(),cases:[]};
async function api(body,extra=headers){const r=await fetch(base+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
try{
 const config=await(await fetch(local+'/config')).json();assert.ok(config.identityRegistry);const buyer=await AgentWalletSession.connect(localWalletProvider(local),config,false),seller=await AgentWalletSession.connect(localWalletProvider(local,'seller'),config,false),identity=new AgentIdentityClient(seller,base,headers),reviewer=new AgentIdentityClient(buyer,base,headers),orders=new AgentOrderClient(buyer,base,headers);
 assert.equal((await fetch(base+'/api/identity',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.invalid',...headers},body:JSON.stringify({action:'prepare',agentId:'atlas'})})).status,403);
 assert.equal((await api({action:'prepare',agentId:'atlas',registry:'0x'+'1'.repeat(40)})).status,400);
 const initial=(await(await fetch(base+'/api/workspace',{headers})).json()).state;
 const registered=await identity.registerAndBind('atlas');assert.ok(registered.registryAgentId);
 const challenge=await api({action:'challenge',agentId:'atlas',...registered});assert.equal(challenge.status,200);
 assert.equal((await api({action:'bind',nonce:challenge.data.challenge.nonce,signature:'0x'+'1'.repeat(130)})).status,403);
 assert.equal((await api({action:'challenge',agentId:'atlas',...registered},{'x-agentos-sandbox':'other-'+id})).status,409);
 const signature=await seller.signer.signMessage({account:seller.account,message:challenge.data.challenge.message});const repeated=await Promise.all(Array.from({length:5},()=>api({action:'bind',nonce:challenge.data.challenge.nonce,signature})));assert.ok(repeated.every(r=>r.status===200));assert.equal(repeated[0].data.state.agentIdentities.length,1);
 report.cases.push({name:'registration, owner signature, concurrent replay and workspace isolation',registered,status:'passed'});
 const order=await orders.create({agentId:'atlas',title:'Identity-bound paid order',budget:1000,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury.eth',to:'builder.eth',cents:123},{block:2,from:'treasury.eth',to:'research.eth',cents:456}]}});assert.equal(order.agentIdentity.registryAgentId,registered.registryAgentId);
 assert.equal((await api({action:'feedback-prepare',orderId:order.id,score:90})).status,409);
 assert.equal((await api({action:'feedback-prepare',orderId:order.id,score:90},{'x-agentos-sandbox':'other-'+id})).status,404);
 const funding=await buyer.fundOrder(order,120);await orders.activate(order,funding);const done=await orders.wait(order.id);assert.equal(done.settlement.status,'paid');
 const approvalABI=parseAbi(['function approve(address to,uint256 tokenId)']);
 const approve=async(to)=>{const hash=await seller.signer.sendTransaction({to:config.identityRegistry,account:seller.account,data:encodeFunctionData({abi:approvalABI,functionName:'approve',args:[to,BigInt(registered.registryAgentId)]}),gas:300000n});await seller.client.waitForTransactionReceipt({hash});};
 await approve(buyer.account);assert.equal((await api({action:'feedback-prepare',orderId:order.id,score:90})).status,403);await approve('0x0000000000000000000000000000000000000000');
 const prepared=await Promise.all(Array.from({length:5},()=>api({action:'feedback-prepare',orderId:order.id,score:90})));assert.ok(prepared.every(r=>r.status===200));assert.equal(new Set(prepared.map(r=>r.data.intent.feedbackHash)).size,1);
 const hash=await reviewer.feedback(order.id,90);const confirmations=await Promise.all(Array.from({length:5},()=>api({action:'feedback-confirm',orderId:order.id,transactionHash:hash})));assert.ok(confirmations.every(r=>r.status===200));
 let state=confirmations[0].data.state;assert.equal(state.agentFeedback.length,1);assert.equal(state.agentFeedback[0].status,'active');assert.equal((await api({action:'feedback-prepare',orderId:order.id,score:99})).status,409);assert.equal((await api({action:'feedback-confirm',orderId:order.id,transactionHash:funding.transactionHash})).status,409);
 await reviewer.feedback(order.id,90);const logs=await buyer.client.getContractEvents({address:config.reputationRegistry,abi:reputationABI,eventName:'NewFeedback',args:{agentId:BigInt(registered.registryAgentId),clientAddress:buyer.account},fromBlock:0n});assert.equal(logs.length,1);assert.deepEqual(state.ledger,initial.ledger);
 report.cases.push({name:'paid-only feedback, chain event, replay and unique workspace review',order:done,feedback:state.agentFeedback[0],eventCount:logs.length,status:'passed'});
 await reviewer.revoke(state.agentFeedback[0]);state=(await(await fetch(base+'/api/workspace',{headers})).json()).state;assert.equal(state.agentFeedback[0].status,'revoked');report.cases.push({name:'reviewer revocation reflected in D1',status:'passed'});
 const rejected=await orders.create({agentId:'atlas',title:'Refunded orders cannot add paid reviews',budget:1000,scenario:'injection'});await orders.activate(rejected,await buyer.fundOrder(rejected,120));assert.equal((await orders.wait(rejected.id)).settlement.status,'refunded');assert.equal((await api({action:'feedback-prepare',orderId:rejected.id,score:100})).status,409);
 report.cases.push({name:'refunded order is excluded from paid feedback',status:'passed'});
 const transfer=await seller.signer.sendTransaction({to:config.identityRegistry,account:seller.account,data:encodeFunctionData({abi:parseAbi(['function transferFrom(address from,address to,uint256 tokenId)']),functionName:'transferFrom',args:[seller.account,buyer.account,BigInt(registered.registryAgentId)]}),gas:300000n});await seller.client.waitForTransactionReceipt({hash:transfer});
 assert.equal(await buyer.client.readContract({address:config.identityRegistry,abi:identityABI,functionName:'getAgentWallet',args:[BigInt(registered.registryAgentId)]}),'0x0000000000000000000000000000000000000000');
 const refresh=await api({action:'refresh',agentId:'atlas'});assert.equal(refresh.status,200);assert.equal(refresh.data.state.agentIdentities[0].status,'stale');await assert.rejects(orders.create({agentId:'atlas',title:'Reject stale identity',budget:1000}),/ownership, payment wallet/);
 report.cases.push({name:'NFT transfer clears payment wallet; stale identity cannot create new orders',transactionHash:transfer,status:'passed'});
 const rebound=await identity.registerAndBind('atlas');assert.notEqual(rebound.registryAgentId,registered.registryAgentId);const replacement=await orders.create({agentId:'atlas',title:'New identity restores order creation',budget:1000});assert.equal(replacement.agentIdentity.registryAgentId,rebound.registryAgentId);await orders.cancel(replacement.id);
 report.cases.push({name:'provider registers a new identity after transfer and restores new orders',registered:rebound,status:'passed'});
 report.status='passed';for(const c of report.cases)console.log('PASS '+c.name);
}catch(e){report.status='failed';report.error=e instanceof Error?e.message:String(e);console.error(report.error);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path='outputs/identity-demo-'+id+'.json';await writeFile(path,JSON.stringify(report,null,2));console.log('Identity demo evidence: '+path);}
