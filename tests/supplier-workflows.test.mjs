import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import {keccak256,stringToHex} from 'viem';
import {seed,DomainError} from '../lib/agentos/engine.ts';
import {createWorkflow,controlWorkflow} from '../lib/agentos/workflows.ts';
import {futurePurchaseReservations} from '../lib/agentos/purchase-reservations.ts';
import {supplierQuoteMessage,verifyOrderQuote} from '../lib/agentos/supplier-quote.ts';
import {vaultAllowance} from '../lib/agentos/vault.ts';
import {AgentWorkflowClient} from '../sdk/workflows.ts';

const address=n=>'0x'+String(n).repeat(40),buyer=address(1),seller=address(2),h=keccak256(stringToHex('supplier workflow fixture')),seconds=1800000000,now=new Date(seconds*1000).toISOString();
async function fixture(){
 const signer=privateKeyToAccount(generatePrivateKey()),deployment={mode:'local',chainId:31337,token:address(3),escrow:address(4),seller,forwarder:address(5),metadataHash:h,confirmations:1,deployedBlock:'0',vault:address(6),vaultExecutor:address(7)},state=seed(now),session={sessionId:crypto.randomUUID(),chainId:31337,escrow:deployment.escrow,token:deployment.token,seller,vault:deployment.vault,executor:deployment.vaultExecutor,owner:buyer,epoch:'1',perTaskCents:500,totalCents:500,dailyCents:1000,expires:String(seconds+3600),skills:['event-analysis','treasury-report'],scope:h,message:'fixture',challengeExpiresAt:now,signature:'fixture'};
 state.vaultSessions=[session];let quotes=0,publishes=0,price=175,mode='healthy';const bytes=new Map();
 const binding=(agentId,supplierId)=>({supplier:{id:supplierId,name:supplierId,revision:'1',signer:signer.address,skills:['event-analysis','treasury-report'],configHash:h},identity:{agentId,chainId:31337,registry:address(8),reputationRegistry:address(8),registryAgentId:'1',owner:seller,wallet:seller,agentURI:'data:application/json;base64,e30=',documentHash:h,registrationTx:h,registrationBlock:'1',registrationBlockHash:h,checkedBlock:'1',checkedBlockHash:h,checkedAt:now,status:'verified'}});
 const access={scope:h,chainTime:async()=>seconds,bind:async(_,a,s)=>binding(a,s),authorize:async()=>{if(mode==='revoked')throw new DomainError('Delegation revoked.','SUPPLIER_REJECTED');},checkSession:async()=>{},quote:async(_,request)=>{quotes++;const payload={version:'agentos.skill-quote.v1',request:mode==='foreign-input'?{...request,inputHash:keccak256(stringToHex('other'))}:request,priceCents:price,issuedAt:mode==='expired'?seconds-1:seconds,expiresAt:mode==='expired'?seconds:seconds+600};return {payload,signature:await signer.signMessage({message:supplierQuoteMessage(payload)})};}};
 const publish=async b=>{publishes++;if(bytes.has(b.id))assert.equal(bytes.get(b.id),b.datasetText);bytes.set(b.id,b.datasetText);return {datasetUrl:'https://data.example/'+b.id,artifactUrl:'https://artifact.example/'+b.id,datasetHash:b.datasetHash,verification:b.verification};};
 const draft={requestId:crypto.randomUUID(),buyer,title:'Independent accepted results',vaultSessionId:session.sessionId,timeoutSeconds:300,supplierPricing:'signed-at-execution-under-cap',input:{dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'treasury',to:'a',cents:123}]},steps:[{agentId:'atlas',supplierId:'alpha',budget:200,input:{from:'original'}},{agentId:'relay',supplierId:'beta',budget:200,input:{from:'step',step:0}}]};
 return {state,session,deployment,draft,access,publish,binding,counters:()=>({quotes,publishes}),price:n=>price=n,mode:m=>mode=m,create:()=>createWorkflow(state,draft,deployment,publish,now,access)};
}
test('supplier workflow reserves future ceilings, accepts lower signed prices, and binds the exact input, payer and provider',async()=>{
 const f=await fixture(),s=await f.create(),w=s.workflows[0],o=s.chainOrders[0];assert.equal(w.version,'agentos.workflow.v3');assert.equal(w.workspaceHash,h);assert.equal(w.steps[1].orderId,undefined);assert.equal(o.quote,175);assert.equal(o.budget,200);assert.equal(o.supplier.id,'alpha');assert.equal(o.supplierQuote.payload.request.payer,f.deployment.vault);assert.equal(f.counters().quotes,1,'future input must not be quoted before parent payment');await verifyOrderQuote(o,seconds,h);
 assert.equal(futurePurchaseReservations(s)[0].quote,200);assert.throws(()=>vaultAllowance(s,f.session.sessionId,buyer,'event-analysis',200,126,now),/total allowance/);assert.equal(vaultAllowance(s,f.session.sessionId,buyer,'event-analysis',200,125,now).sessionId,f.session.sessionId);
 const cancelled=controlWorkflow(s,w.id,'cancel',now);assert.equal(futurePurchaseReservations(cancelled).length,0);assert.equal(cancelled.chainOrders[0].status,'cancelled');
});
test('all future caps and payees must be authorized before the first quote or evidence publication',async()=>{
 const f=await fixture();f.session.totalCents=399;await assert.rejects(f.create(),/total allowance/);assert.deepEqual(f.counters(),{quotes:0,publishes:0});
 f.session.totalCents=500;f.access.bind=async(_,a,s)=>{const b=f.binding(a,s);if(s==='beta')b.identity.wallet=address(9);return b;};await assert.rejects(f.create(),/does not permit this seller/);assert.deepEqual(f.counters(),{quotes:0,publishes:0});
 f.state.policy.active=false;await assert.rejects(f.create(),/permission has been revoked/);assert.deepEqual(f.counters(),{quotes:0,publishes:0});f.state.policy.active=true;
 const noConsent={...f.draft};delete noConsent.supplierPricing;await assert.rejects(createWorkflow(f.state,noConsent,f.deployment,f.publish,now,f.access),/explicit.*ceilings/);
});
test('quote over ceiling, changed input, expiry and revoked delegation cannot publish or create a purchase',async()=>{
 for(const mode of ['over-cap','foreign-input','expired','revoked']){const f=await fixture();if(mode==='over-cap')f.price(201);else f.mode(mode);await assert.rejects(f.create(),mode==='over-cap'?/ceiling/:mode==='expired'?/not currently valid/:mode==='revoked'?/revoked/:/commitment/);assert.equal(f.counters().publishes,0);assert.equal(f.state.chainOrders,undefined);}
});
test('same request survives response loss and expiry, but cannot change workspace, provider or cap',async()=>{
 const f=await fixture(),s=await f.create();f.mode('revoked');f.access.chainTime=async()=>seconds+2000;
 assert.equal(await createWorkflow(s,f.draft,f.deployment,f.publish,now,f.access),s);assert.equal(f.counters().quotes,1);
 for(const patch of [{budget:201},{supplierId:'replacement'}]){const d=structuredClone(f.draft);Object.assign(d.steps[1],patch);await assert.rejects(createWorkflow(s,d,f.deployment,f.publish,now,f.access),/different parameters/);}
 await assert.rejects(createWorkflow(s,f.draft,f.deployment,f.publish,now,{...f.access,scope:keccak256(stringToHex('foreign'))}),/workspace/);
});
test('immutable evidence can be replayed after a failed local commit without selecting another supplier',async()=>{
 const f=await fixture(),first=await f.create(),second=await f.create();assert.deepEqual(first,second);assert.deepEqual(f.counters(),{quotes:2,publishes:2});assert.equal(first.chainOrders[0].supplier.id,'alpha');assert.equal(first.workflows[0].steps[1].supplierBinding.supplier.id,'beta');
});
test('SDK refuses server changes to approved workflow ceilings and supplier bindings',async()=>{
 const f=await fixture(),s=await f.create(),original=globalThis.fetch,session={account:buyer,deployment:f.deployment,assertSession:async()=>{}},draft={...f.draft};delete draft.buyer;
 try{
  for(const mutate of [w=>{w.steps[1].budget++;},w=>{w.steps[1].supplierId='other';},w=>{w.workspaceHash=keccak256(stringToHex('other'));}]){globalThis.fetch=async url=>{if(String(url).endsWith('/api/workspace'))return Response.json({scope:h});const workflow=structuredClone(s.workflows[0]);mutate(workflow);return Response.json({workflow});};await assert.rejects(new AgentWorkflowClient(session,'https://demo.example').create(draft),/approved providers/);}
 }finally{globalThis.fetch=original;}
});
