import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import { AgentWalletSession,localWalletProvider } from '../sdk/wallet.ts';
import { AgentOrderClient } from '../sdk/orders.ts';import { AgentIdentityClient } from '../sdk/agent-identity.ts';
const base='http://127.0.0.1:5177',configuration=await(await fetch('http://127.0.0.1:8545/config')).json(),wallet=await AgentWalletSession.connect(localWalletProvider('http://127.0.0.1:8545'),configuration,false),orders=new AgentOrderClient(wallet,base),cases=[];
const fresh=process.argv.includes('--fresh');
for(const scenario of ['success','invalid-delivery']){
 const title='Showcase signed supplier · '+scenario;
 let order=!fresh&&(await orders.orders()).find(o=>o.title===title&&o.deployment.escrow===configuration.escrow&&['completed','refunded'].includes(o.status));const reused=!!order;
 if(!order){order=await orders.create({agentId:'atlas',title,budget:1000,planner:'llm',executor:'supplier',scenario,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'treasury.eth',to:'builder.eth',cents:123},{block:2,from:'treasury.eth',to:'research.eth',cents:456}]}});const funding=await wallet.fundOrder(order,300);await orders.activate(order,funding);order=await orders.wait(order.id,90000);}
 assert.equal(order.settlement.status,scenario==='success'?'paid':'refunded');
 if(scenario==='success'){assert.equal(order.output.totalCents,579);assert.ok(order.supplierDelivery);await new AgentIdentityClient(wallet,base).feedback(order.id,95);}
 const entry={scenario,reused,orderId:order.id,url:base+'/#vault?order='+order.id,settlement:order.settlement.transactionHash};cases.push(entry);console.log(JSON.stringify(entry));
}
await mkdir('outputs',{recursive:true});await writeFile('outputs/showcase.json',JSON.stringify({at:new Date().toISOString(),cases},null,2));console.log('Showcase ready. Evidence: outputs/showcase.json');
