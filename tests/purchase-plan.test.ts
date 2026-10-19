import test from 'node:test';import assert from 'node:assert/strict';import {seed} from '../lib/agentos/engine.ts';import {purchaseChoices,validatePurchasePlan,proposePurchase} from '../lib/agentos/purchase-plan.ts';
test('purchase proposals cannot invent cost, executors or authority and disabled/revoked services disappear',()=>{
 const state=seed(),choices=purchaseChoices(state,1000,new Set(['atlas']));assert.ok(choices.some(c=>c.id==='atlas:supplier'));assert.ok(!choices.some(c=>c.id==='sage:supplier'));
 assert.throws(()=>validatePurchasePlan({choiceId:'attacker:builtin',reason:'lowest-price'},choices));assert.throws(()=>validatePurchasePlan({choiceId:'atlas:builtin',reason:'lowest-price'},choices));assert.throws(()=>validatePurchasePlan({choiceId:'relay:builtin',reason:'allocation-report'},choices));assert.throws(()=>validatePurchasePlan({choiceId:'relay:builtin',reason:'lowest-price',price:0},choices));
 assert.equal(validatePurchasePlan({choiceId:'relay:builtin',reason:'lowest-price'},choices).choice.price,180);state.policy.active=false;assert.deepEqual(purchaseChoices(state,1000),[]);
});
test('different actual model responses produce different bounded proposals, failure never creates a purchase',async()=>{
 const config={url:'https://model.example/v1/chat/completions',model:'test',revision:'1',timeoutMs:1000,maxTokens:128},choices=purchaseChoices(seed(),1000);
 for(const [goal,choiceId,reason] of [['cheapest','relay:builtin','lowest-price'],['recipient allocation','sage:builtin','allocation-report']]){
  const result=await proposePurchase(config,undefined,goal,choices,async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.ok(!JSON.stringify(body).includes('privateKey'));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:reason,executor:'builtin'})}}]});});assert.equal(result.choice.id,choiceId);assert.match(result.responseHash,/^0x/);
 }
 await assert.rejects(proposePurchase(config,undefined,'cheapest',choices,async()=>Response.json({error:'unavailable'},{status:503})),/No purchase/);
});
