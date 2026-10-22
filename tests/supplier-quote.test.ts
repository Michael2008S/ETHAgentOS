import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {keccak256,stringToHex} from 'viem';
import {seed,normalizeInput} from '../lib/agentos/engine.ts';
import {createOrder,orderCommitment,type OrderDraft} from '../lib/agentos/orders.ts';
import {inputEvidence} from '../sdk/wallet.ts';
import { makeSupplierQuoteRequest, verifySupplierQuote, supplierQuoteMessage, verifyOrderQuote, type SupplierQuoteRequest } from '../lib/agentos/supplier-quote.ts';
import type {AgentIdentity} from '../lib/agentos/identity.ts';
import type {SupplierDescriptor} from '../lib/agentos/supplier.ts';
import type {WalletDeployment} from '../sdk/wallet.ts';
const signer=privateKeyToAccount(generatePrivateKey()),buyer='0x1111111111111111111111111111111111111111',seller='0x2222222222222222222222222222222222222222',escrow='0x3333333333333333333333333333333333333333',token='0x4444444444444444444444444444444444444444',registry='0x5555555555555555555555555555555555555555',h=keccak256(stringToHex('fixture')),now=1800000000;
const deployment={mode:'local',chainId:31337,token,escrow,seller,forwarder:buyer,metadataHash:h,confirmations:1,deployedBlock:'0'} satisfies WalletDeployment;
const supplier={id:'quoted-provider',name:'Quoted provider',revision:'1.0.0',signer:signer.address,skills:['event-analysis'],configHash:h} satisfies SupplierDescriptor;
const identity={agentId:'atlas',chainId:31337,registry,reputationRegistry:registry,registryAgentId:'1',owner:seller,wallet:seller,agentURI:'data:application/json;base64,e30=',documentHash:h,registrationTx:h,registrationBlock:'1',registrationBlockHash:h,checkedBlock:'1',checkedBlockHash:h,checkedAt:new Date(now*1000).toISOString(),status:'verified'} satisfies AgentIdentity;
async function fixture(){const requestId=crypto.randomUUID(),input=normalizeInput({dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'a',to:'b',cents:123}]}),request=await makeSupplierQuoteRequest({requestId,workspaceHash:h,buyer,payer:buyer,agentId:'atlas',skill:'event-analysis',input,identity,deployment,supplier}),payload={version:'agentos.skill-quote.v1' as const,request,priceCents:175,issuedAt:now,expiresAt:now+600},quote={payload,signature:await signer.signMessage({message:supplierQuoteMessage(payload)})};return {requestId,input,request,quote};}
test('signed quotes bind order, workspace, input, payer, identity, asset and exact supplier price',async()=>{
 const f=await fixture();assert.deepEqual(await verifySupplierQuote(f.quote,f.request,supplier,now),f.quote);
 for(const change of ([{requestId:crypto.randomUUID()},{workspaceHash:keccak256(stringToHex('other'))},{buyer:seller},{payer:seller},{chainId:11155111},{escrow:token},{token:escrow},{agentId:'relay'},{skill:'treasury-report'},{inputHash:keccak256(stringToHex('changed'))},{seller:buyer},{registry:buyer},{registryAgentId:'2'},{documentHash:keccak256(stringToHex('changed'))},{configHash:keccak256(stringToHex('changed'))}] satisfies Partial<SupplierQuoteRequest>[]))await assert.rejects(verifySupplierQuote(f.quote,{...f.request,...change},supplier,now),/commitment differs/);
 const altered=structuredClone(f.quote);altered.payload.priceCents++;await assert.rejects(verifySupplierQuote(altered,f.request,supplier,now),/signature/);await assert.rejects(verifySupplierQuote(f.quote,f.request,{...supplier,signer:buyer},now),/signature/);
 for(const clock of [now-1,now+600])await assert.rejects(verifySupplierQuote(f.quote,f.request,supplier,clock),/not currently valid/);
 for(const value of [0,-1,1.5,1000001])await assert.rejects(verifySupplierQuote({...f.quote,payload:{...f.quote.payload,priceCents:value}},f.request,supplier,now),/Invalid signed/);
});
test('quoted orders use provider prices, freeze full signatures in buyer commitments and replay after expiry without changing the purchase',async()=>{
 const f=await fixture(),state=seed(),bytes=inputEvidence({id:'chain-'+f.requestId,input:f.input,skill:'event-analysis'},buyer),spec={datasetUrl:'https://data.example/'+bytes.id,artifactUrl:'https://artifact.example/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification},draft={requestId:f.requestId,title:'Quoted purchase',agentId:'atlas',buyer,budget:200,input:f.input,spec,scenario:'success' as const,timeoutSeconds:300,executor:'supplier' as const,supplier,agentIdentity:identity,supplierQuote:f.quote} satisfies OrderDraft;
 const next=await createOrder(state,draft,deployment,new Date(now*1000).toISOString(),{workspaceHash:h,now}),order=next.chainOrders![0];assert.equal(order.quote,175);assert.equal(state.agents[0].price,240);await verifyOrderQuote(order,now,h);
 const commitment=await orderCommitment(order);assert.notEqual(await orderCommitment({...order,supplierQuote:{...f.quote,signature:('0x'+'00'.repeat(65)) as `0x${string}`}}),commitment);
 assert.equal(await createOrder(next,draft,deployment,new Date((now+1000)*1000).toISOString()),next);
 await assert.rejects(createOrder(state,{...draft,budget:174},deployment,new Date(now*1000).toISOString()),/budget/);await assert.rejects(createOrder(state,draft,deployment,new Date((now+600)*1000).toISOString()),/not currently valid/);
 await assert.rejects(createOrder(state,draft,deployment,new Date(now*1000).toISOString(),{workspaceHash:keccak256(stringToHex('foreign'))}),/commitment/);
 await assert.rejects(verifyOrderQuote({...order,quote:176},now,h),/price differs/);
 const changed=structuredClone(f.quote);changed.payload.priceCents++;await assert.rejects(createOrder(next,{...draft,supplierQuote:changed},deployment),/different chain order parameters/);
});

test('quote HTTP transport fixes the endpoint and authentication, limits responses and never accepts a changed signature',async()=>{
 const {createSupplier,parseSupplierConfiguration}=await import('../lib/agentos/supplier.ts'),f=await fixture(),config=parseSupplierConfiguration({url:'https://quoted.example/v1/execute',id:supplier.id,name:supplier.name,revision:supplier.revision,signer:supplier.signer,skills:supplier.skills,timeoutMs:1000}),descriptor=(await import('../lib/agentos/supplier.ts')).supplierDescriptor;
 const actual=await descriptor(config),request={...f.request,configHash:actual.configHash},payload={...f.quote.payload,request},offer={payload,signature:await signer.signMessage({message:supplierQuoteMessage(payload)})};let seen=0;
 const client=await createSupplier(config,async()=>{},'synthetic-quote-secret',async(url,init)=>{seen++;assert.equal(url,'https://quoted.example/v1/quote');assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-quote-secret');assert.ok(new Headers(init?.headers).get('Idempotency-Key')?.startsWith('quote-0x'));assert.deepEqual(JSON.parse(String(init?.body)),request);return Response.json(offer);});
 assert.deepEqual(await client.quote!(request),offer);assert.equal(seen,1);
 for(const response of [new Response('{}',{status:302}),new Response('{}',{status:503}),new Response('<html>bad</html>'),new Response('x'.repeat(65537)),Response.json({...offer,payload:{...offer.payload,priceCents:176}})]){
  const failing=await createSupplier(config,async()=>{},undefined,async()=>response);await assert.rejects(failing.quote!(request),/unavailable|Invalid signed|size limit|signature/);
 }
 assert.ok(!Object.hasOwn(request,'input'));assert.ok(!Object.hasOwn(request,'records'));
});

test('SDK refuses a returned order that changes the reviewed quote or its quoted input',async()=>{
 const {AgentOrderClient}=await import('../sdk/orders.ts'),f=await fixture(),bytes=inputEvidence({id:'chain-'+f.requestId,input:f.input,skill:'event-analysis'},buyer),spec={datasetUrl:'https://data.example/'+bytes.id,artifactUrl:'https://artifact.example/'+bytes.id,datasetHash:bytes.datasetHash,verification:bytes.verification},draft={requestId:f.requestId,title:'Reviewed quote',agentId:'atlas',buyer,budget:500,input:f.input,spec,scenario:'success' as const,timeoutSeconds:300,executor:'supplier' as const,supplier,agentIdentity:identity,supplierQuote:f.quote} satisfies OrderDraft,state=await createOrder(seed(),draft,deployment,new Date(now*1000).toISOString()),order=state.chainOrders![0],original=globalThis.fetch;
 const session={account:buyer,deployment} as unknown as import('../sdk/wallet.ts').AgentWalletSession,client=new AgentOrderClient(session,'https://application.example'),input={requestId:f.requestId,agentId:'atlas',supplierId:supplier.id,supplierQuote:f.quote,executor:'supplier' as const,title:draft.title,budget:500,input:f.input};
 try{
  globalThis.fetch=async()=>Response.json({order});assert.equal((await client.create(input)).id,order.id);
  globalThis.fetch=async()=>Response.json({order:{...order,supplierQuote:{...f.quote,signature:'0x'+'00'.repeat(65)}}});await assert.rejects(client.create(input),/changed the approved/);
  globalThis.fetch=async()=>Response.json({order:{...order,input:{...order.input,records:[{block:1,from:'a',to:'changed',cents:123}]}}});await assert.rejects(client.create(input),/commitment differs/);
 }finally{globalThis.fetch=original;}
});
