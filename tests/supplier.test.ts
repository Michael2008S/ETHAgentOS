import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { seed,digest } from '../lib/agentos/engine.ts';
import { createOrder,claimSupplierLease,commitSupplierDelivery } from '../lib/agentos/orders.ts';
import { createSupplier,parseSupplierConfiguration,supplierDescriptor,supplierRequest,supplierJobId,supplierReceiptMessage,verifySupplierDelivery,type SupplierDelivery } from '../lib/agentos/supplier.ts';
import type { AgentIdentity } from '../lib/agentos/identity.ts';
const signer=privateKeyToAccount(generatePrivateKey()),address=('0x'+'1'.repeat(40)) as `0x${string}`,hash=('0x'+'2'.repeat(64)) as `0x${string}`;
const config=parseSupplierConfiguration({url:'https://skills.example/v1/execute',id:'test-supplier',name:'Test supplier',revision:'1',signer:signer.address,skills:['event-analysis']});
const now='2026-10-19T01:00:00.000Z';
async function fixture(){
 const descriptor=await supplierDescriptor(config),identity={registry:address,registryAgentId:'0',owner:address,wallet:address,documentHash:hash} as AgentIdentity;
 const state=await createOrder(seed(now),{agentId:'atlas',title:'Supplier test',requestId:crypto.randomUUID(),buyer:address,budget:1000,scenario:'success',timeoutSeconds:300,executor:'supplier',supplier:descriptor,agentIdentity:identity,input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'x',to:'a',cents:123},{block:2,from:'x',to:'b',cents:456}]},spec:{datasetUrl:'https://data.example',artifactUrl:'https://output.example',datasetHash:hash}},{mode:'local',chainId:31337,token:address,escrow:address,forwarder:address,metadataHash:hash,confirmations:1,seller:address,deployedBlock:'0'},now);
 const order=state.chainOrders![0];order.status='running';order.step=2;order.chainDeadline='9999999999';order.deadlineAt='2026-10-19T02:00:00.000Z';order.funding={transactionHash:hash} as typeof order.funding;return {state,order,descriptor,request:await supplierRequest(order)};
}
async function signed(request:Awaited<ReturnType<typeof supplierRequest>>,totalCents=579):Promise<SupplierDelivery>{const output={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,transferCount:2,totalCents,uniqueRecipients:2},payload={version:'agentos.skill-delivery.v1' as const,requestHash:await digest(request) as `0x${string}`,configHash:request.supplier.configHash,jobId:supplierJobId(request),outputHash:await digest(output) as `0x${string}`,output,issuedAt:now};return {payload,signature:await signer.signMessage({message:supplierReceiptMessage(payload)})};}
test('supplier receipt binds signer, request, job and output; malformed and redirected responses fail closed',async()=>{
 const {request}=await fixture(),delivery=await signed(request);assert.deepEqual(await verifySupplierDelivery(delivery,request),delivery);
 for(const changed of [{...delivery,signature:'0x'+'1'.repeat(130)},{...delivery,payload:{...delivery.payload,output:{...delivery.payload.output,totalCents:999}}},{...delivery,payload:{...delivery.payload,jobId:hash}}])await assert.rejects(verifySupplierDelivery(changed,request));
 let calls=0;const provider=await createSupplier(config,async()=>{},'supplier-private-key',async(url,init)=>{calls++;assert.equal(url,config.url);assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer supplier-private-key');assert.equal(new Headers(init?.headers).get('Idempotency-Key'),supplierJobId(request));assert.equal(String(init?.body).includes('supplier-private-key'),false);return Response.json(delivery);});assert.deepEqual(await provider.execute(request),delivery);assert.equal(calls,1);
 for(const response of [new Response(null,{status:302,headers:{Location:'https://untrusted.example'}}),new Response('secret-provider-error',{status:500}),new Response('bad json'),new Response('x'.repeat(65537))]){const bad=await createSupplier(config,async()=>{},undefined,async()=>response);await assert.rejects(bad.execute(request),error=>error instanceof Error&&!error.message.includes('secret-provider-error'));}
});
test('supplier configuration rejects caller credentials, unsafe URLs and excessive resource limits',()=>{
 for(const patch of [{url:'http://skills.example/v1/execute'},{url:'https://secret@skills.example/v1/execute'},{url:'https://skills.example/v1/execute?key=private'},{apiKey:'private'},{timeoutMs:999999},{skills:['system.exec']}])assert.throws(()=>parseSupplierConfiguration({...config,...patch}));
 assert.throws(()=>parseSupplierConfiguration({...config,url:'http://127.0.0.1:7461/v1/execute'}));assert.equal(parseSupplierConfiguration({...config,url:'http://127.0.0.1:7461/v1/execute'},true).id,'test-supplier');
});
test('supplier leases stop unpaid and forbidden work; stale, cancelled and revoked deliveries cannot commit',async()=>{
 const {state,order,request}=await fixture(),delivery=await signed(request),unfunded=structuredClone(state);unfunded.chainOrders![0].funding=null;assert.strictEqual(await claimSupplierLease(unfunded,order.id,'unfunded',now),unfunded);
 const injection=structuredClone(state);injection.chainOrders![0].scenario='injection';const blocked=await claimSupplierLease(injection,order.id,'blocked',now);assert.equal(blocked.chainOrders![0].status,'awaiting-settlement');assert.equal(blocked.chainOrders![0].supplierLease,undefined);
 const leased=await claimSupplierLease(state,order.id,'first',now);assert.strictEqual(await claimSupplierLease(leased,order.id,'second',now),leased);const renewed=await claimSupplierLease(leased,order.id,'second','2026-10-19T01:02:00.000Z');assert.strictEqual(await commitSupplierDelivery(renewed,order.id,'first',{delivery},'2026-10-19T01:02:01.000Z'),renewed);
 const cancelled=structuredClone(leased);cancelled.chainOrders![0].status='awaiting-settlement';assert.strictEqual(await commitSupplierDelivery(cancelled,order.id,'first',{delivery},now),cancelled);
 const revoked=structuredClone(leased);revoked.policy.active=false;const rejected=await commitSupplierDelivery(revoked,order.id,'first',{delivery},now);assert.equal(rejected.chainOrders![0].output,null);assert.equal(rejected.chainOrders![0].status,'awaiting-settlement');
 const invalid=await commitSupplierDelivery(leased,order.id,'first',{delivery:await signed(request,580)},now);assert.equal(invalid.chainOrders![0].output,null);assert.match(invalid.chainOrders![0].failure!,/independent recomputation/);
 const valid=await commitSupplierDelivery(leased,order.id,'first',{delivery},now);assert.equal(valid.chainOrders![0].output?.totalCents,579);assert.equal(valid.chainOrders![0].step,3);assert.deepEqual(valid.ledger,state.ledger);
});
