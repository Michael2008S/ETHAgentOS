import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {keccak256,stringToHex} from 'viem';
import {seed,normalizeInput,DomainError} from '../lib/agentos/engine.ts';
import {quotedPurchaseChoices,MAX_PURCHASE_QUOTES,type PurchaseQuoteCandidate} from '../lib/agentos/purchase-quotes.ts';
import {proposePurchase} from '../lib/agentos/purchase-plan.ts';
import {supplierQuoteMessage} from '../lib/agentos/supplier-quote.ts';
import type {WalletDeployment} from '../sdk/wallet.ts';
import type {AgentIdentity} from '../lib/agentos/identity.ts';
import type {VaultSession} from '../lib/agentos/vault.ts';
import type {SupplierDescriptor} from '../lib/agentos/supplier.ts';
const buyer='0x1111111111111111111111111111111111111111',seller='0x2222222222222222222222222222222222222222',escrow='0x3333333333333333333333333333333333333333',token='0x4444444444444444444444444444444444444444',registry='0x5555555555555555555555555555555555555555',h=keccak256(stringToHex('comparison fixture'));
const deployment={mode:'local',chainId:31337,token,escrow,seller,forwarder:buyer,metadataHash:h,confirmations:1,deployedBlock:'0'} satisfies WalletDeployment;
async function fixture(){
 const state=seed(),before=structuredClone(state),now=Math.floor(Date.now()/1000),input=normalizeInput({dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'treasury',to:'research',cents:123}]}),requests:unknown[]=[];
 state.agents.find(a=>a.id==='atlas')!.price=1;state.agents.find(a=>a.id==='relay')!.price=9999;
 const candidates:PurchaseQuoteCandidate[]=['atlas','relay'].map((agentId,i)=>{
  const signer=privateKeyToAccount(generatePrivateKey()),descriptor={id:'supplier-'+i,name:'Independent '+i,revision:'1.0.0',signer:signer.address,skills:['event-analysis'],configHash:keccak256(stringToHex('supplier-'+i))} satisfies SupplierDescriptor;
  const identity={agentId,chainId:31337,registry,reputationRegistry:registry,registryAgentId:String(i+1),owner:seller,wallet:seller,agentURI:'data:application/json;base64,e30=',documentHash:h,registrationTx:h,registrationBlock:'1',registrationBlockHash:h,checkedBlock:'1',checkedBlockHash:h,checkedAt:new Date().toISOString(),status:'verified'} satisfies AgentIdentity;
  return {agentId,identity,supplier:{descriptor,execute:async()=>{throw new Error('Comparing must never execute');},authorize:async()=>{},quote:async request=>{requests.push(request);const payload={version:'agentos.skill-quote.v1' as const,request,priceCents:i===0?240:200,issuedAt:now,expiresAt:now+600};return {payload,signature:await signer.signMessage({message:supplierQuoteMessage(payload)})};}}};
 });
 return {state,before,requests,candidates,context:{buyer,payer:buyer,workspaceHash:h,deployment,input,candidates,chainTime:async()=>now} satisfies Parameters<typeof quotedPurchaseChoices>[2]};
}
test('comparison selects actual signed prices despite opposite local price hints and never creates or funds an order',async()=>{
 const f=await fixture(),snapshot=structuredClone(f.state),catalog=await quotedPurchaseChoices(f.state,300,f.context),suppliers=catalog.choices.filter(c=>c.executor==='supplier');
 assert.equal(suppliers.length,2);assert.deepEqual(suppliers.map(c=>c.price),[240,200]);assert.ok(!catalog.choices.some(c=>c.id==='relay:builtin'));
 const proposal=await proposePurchase({url:'https://model.example/v1/chat/completions',model:'test',revision:'1',timeoutMs:1000,maxTokens:128},undefined,'cheapest independent signed supplier',catalog.choices,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"intent":"lowest-price","executor":"supplier"}'}}]}));
 assert.equal(proposal.choice.agentId,'relay');assert.equal(proposal.choice.price,200);assert.equal(proposal.choice.supplierQuote?.payload.request.buyer,buyer);assert.deepEqual(f.state,snapshot);assert.equal(f.requests.length,2);assert.ok(!JSON.stringify(f.requests).includes('records'));assert.notEqual(suppliers[0].supplierQuote?.payload.request.requestId,suppliers[1].supplierQuote?.payload.request.requestId);
});
test('unavailable, altered and over-budget offers are excluded explicitly and never replaced by local supplier hints',async()=>{
 const f=await fixture();f.candidates[0].supplier.quote=async()=>{throw new DomainError('down','UNAVAILABLE');};
 let result=await quotedPurchaseChoices(f.state,210,f.context);assert.equal(result.choices.filter(c=>c.executor==='supplier').length,1);assert.equal(result.excluded[0].reason,'quote-unavailable');
 result=await quotedPurchaseChoices(f.state,199,f.context);assert.equal(result.choices.filter(c=>c.executor==='supplier').length,0);assert.ok(result.excluded.some(e=>e.reason==='over-budget'));
 const original=f.candidates[1].supplier.quote!;f.candidates[1].supplier.quote=async request=>{const quote=await original(request);quote.payload.priceCents=1;return quote;};
 result=await quotedPurchaseChoices(f.state,300,f.context);assert.equal(result.choices.filter(c=>c.executor==='supplier').length,0);assert.ok(result.excluded.some(e=>e.reason==='quote-rejected'));
 f.state.policy.active=false;const calls=f.requests.length;assert.deepEqual(await quotedPurchaseChoices(f.state,300,f.context),{choices:[],excluded:[]});assert.equal(f.requests.length,calls);
});
test('comparison uses a fresh post-response chain clock, binds input and stops rather than truncate an oversized market',async()=>{
 const f=await fixture(),now=await f.context.chainTime();let result=await quotedPurchaseChoices(f.state,300,{...f.context,chainTime:async()=>now+601});assert.equal(result.choices.filter(c=>c.executor==='supplier').length,0);
 await assert.rejects(quotedPurchaseChoices(f.state,300,{...f.context,candidates:Array.from({length:MAX_PURCHASE_QUOTES+1},()=>f.candidates[0])}),/Narrow/);
 const quote=await f.candidates[0].supplier.quote!((f.requests[0] as Parameters<NonNullable<typeof f.candidates[0]['supplier']['quote']>>[0]));
 f.candidates[0].supplier.quote=async()=>quote;result=await quotedPurchaseChoices(f.state,300,{...f.context,input:normalizeInput({dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'changed',to:'b',cents:999}]})});assert.ok(result.excluded.some(e=>e.agentId==='atlas'&&e.reason==='quote-rejected'));
});
test('signed Vault scope, skills, payees and gross session headroom restrict quoted comparison without reserving allowance',async()=>{
 const f=await fixture(),now=await f.context.chainTime(),sessionId=crypto.randomUUID(),session:VaultSession={sessionId,chainId:31337,escrow,token,seller,vault:registry,executor:buyer,owner:buyer,epoch:'1',perTaskCents:300,totalCents:220,dailyCents:300,expires:String(now+600),skills:['event-analysis' as const],scope:h,message:'fixture',challengeExpiresAt:new Date().toISOString(),signature:('0x'+'11'.repeat(65)) as `0x${string}`};
 f.state.vaultSessions=[session];const snapshot=structuredClone(f.state),result=await quotedPurchaseChoices(f.state,300,{...f.context,payer:registry,vaultSessionId:sessionId});
 assert.equal(result.choices.filter(c=>c.executor==='supplier').length,1);assert.equal(result.choices.find(c=>c.executor==='supplier')!.price,200);assert.equal(result.choices.find(c=>c.executor==='supplier')!.supplierQuote?.payload.request.payer,registry);assert.ok(result.excluded.some(e=>e.agentId==='atlas'&&e.reason==='session-denied'));assert.deepEqual(f.state,snapshot);
 session.sellers=[buyer];const denied=await quotedPurchaseChoices(f.state,300,{...f.context,payer:registry,vaultSessionId:sessionId});assert.equal(denied.choices.length,0);assert.ok(denied.excluded.every(e=>e.reason==='session-denied'));
});
