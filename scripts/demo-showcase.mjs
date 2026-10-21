import {AgentOSClient} from '../sdk/index.ts';
import {loopbackService} from '../lib/agentos/local-services.ts';
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import { AgentWalletSession,localWalletProvider } from '../sdk/wallet.ts';
import { AgentOrderClient } from '../sdk/orders.ts';import { AgentIdentityClient } from '../sdk/agent-identity.ts';
const base=loopbackService(process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177'),chainBase=loopbackService(process.env.AGENTOS_CHAIN_URL||'http://127.0.0.1:8545'),configuration=await(await fetch(chainBase+'/config')).json();
if(configuration.mode!=='local'||configuration.chainId!==31337)throw new Error('Showcase setup is restricted to the local test chain.');
const wallet=await AgentWalletSession.connect(localWalletProvider(chainBase),configuration,false),orders=new AgentOrderClient(wallet,base),cases=[],os=new AgentOSClient(base);
const profileRequest='4ea152dc-744e-4db5-b4da-a1050886f58f',agentId='custom-'+profileRequest;
await os.registerAgent({name:'Showcase supplier',description:'Dedicated signed-transfer showcase service',skill:'event-analysis'},profileRequest);
const provider=await AgentWalletSession.connect(localWalletProvider(chainBase,'seller'),configuration,false),identities=new AgentIdentityClient(provider,base);await identities.registerAndBind(agentId);
const identity=(await os.workspace()).agentIdentities.find(i=>i.agentId===agentId),supplierResponse=await fetch(base+'/api/suppliers');if(!supplierResponse.ok)throw new Error('Showcase requires a configured supplier.');const supplier=(await supplierResponse.json()).descriptor;await identities.authorizeSupplier(identity,supplier);
const fresh=process.argv.includes('--fresh');
for(const scenario of ['success','invalid-delivery']){
 const title='Showcase signed supplier · '+scenario;
 let order=!fresh&&(await orders.orders()).find(o=>o.agentId===agentId&&o.title===title&&o.deployment.escrow===configuration.escrow&&['completed','refunded'].includes(o.status));const reused=!!order;
 if(!order){order=await orders.create({agentId,supplierId:supplier.id,title,budget:1000,planner:'llm',executor:'supplier',scenario,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury.eth',to:'builder.eth',cents:123},{block:2,from:'treasury.eth',to:'research.eth',cents:456}]}});const funding=await wallet.fundOrder(order,300);await orders.activate(order,funding);order=await orders.wait(order.id,90000);}
 assert.equal(order.settlement.status,scenario==='success'?'paid':'refunded');
 if(scenario==='success'){assert.equal(order.output.totalCents,579);assert.ok(order.supplierDelivery);await new AgentIdentityClient(wallet,base).feedback(order.id,95);}
 const entry={scenario,reused,orderId:order.id,url:base+'/#vault?order='+order.id,settlement:order.settlement.transactionHash};cases.push(entry);console.log(JSON.stringify(entry));
}
await mkdir('outputs',{recursive:true});await writeFile('outputs/showcase.json',JSON.stringify({at:new Date().toISOString(),agentId,identity,supplier,cases},null,2));console.log('Showcase ready. Evidence: outputs/showcase.json');
