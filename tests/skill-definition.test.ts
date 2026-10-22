import {omitFields} from '../lib/agentos/omit-fields.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertSkillDefinition,skillDefinitionHash,type SkillDefinition,type RankedFlowInput,type RankedFlowOutput} from '../lib/agentos/skill-definition.ts';
import {executeRankedFlows} from '../lib/agentos/ranked-flows.ts';
import {recomputeRankedFlows} from '../cre/workflow/ranked-flows.ts';
import {checkSkillConformance} from '../lib/agentos/skill-conformance.ts';
import {deliveryVerification,deliveryArtifact,verifyDelivery,specHash,resultHash,validateVerification} from '../cre/workflow/verify.ts';
import {keccak256,stringToHex} from 'viem';
import {seed,transition,resolveSkillInput,expectedOutput,authorizeOperation} from '../lib/agentos/engine.ts';
const definition=JSON.parse(await readFile(new URL('../examples/skills/treasury-concentration.json',import.meta.url),'utf8')) as SkillDefinition;
const input:RankedFlowInput={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:0,from:'excluded',to:'excluded',cents:999},{block:1,from:'a',to:'z',cents:1},{block:2,from:'a',to:'b',cents:1},{block:2,from:'c',to:'b',cents:1}]};
test('new skill definitions commit their exact namespace/version, bounded recipe and capabilities',()=>{
 assertSkillDefinition(definition);assert.match(skillDefinitionHash(definition),/^0x[0-9a-f]{64}$/);
 assert.equal(skillDefinitionHash({...definition,recipe:{thresholdBps:5000,topN:3,groupBy:'to',kind:'ranked-flows.v1'}}),skillDefinitionHash(definition));
 assert.notEqual(skillDefinitionHash({...definition,recipe:{...definition.recipe,thresholdBps:7000}}),skillDefinitionHash(definition));
 const next={...definition,id:'ext:community.treasury-concentration@2.3.0',version:'2.3.0'};assertSkillDefinition(next);assert.equal(deliveryVerification(next.id,{...input,skillDefinition:next}).skillVersion,'2.3.0');
 for(const change of [{id:'treasury-report'},{id:'ext:community.treasury-concentration@2.0.0'},{version:'01.0.0'},{capabilities:['dataset.read','wallet.transfer']},{url:'https://untrusted.example'},{recipe:{...definition.recipe,topN:11}},{recipe:{...definition.recipe,thresholdBps:10001}},{recipe:{...definition.recipe,code:'process.exit()'}},{output:'anything'},{name:' '.repeat(4)}])assert.throws(()=>assertSkillDefinition({...definition,...change}));
});
test('runtime and independent CRE reductions agree on exact ranks, ties, bounds and basis-point rounding',()=>{
 const expected={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,transferCount:3,totalCents:3,groupBy:'to',accountCount:2,topAccounts:[{account:'b',amountCents:2,shareBps:6666},{account:'z',amountCents:1,shareBps:3333}],thresholdBps:5000,concentrated:true};
 assert.deepEqual(executeRankedFlows(definition,input),expected);assert.deepEqual(recomputeRankedFlows(definition,input),expected);
 const senders={...definition,recipe:{...definition.recipe,groupBy:'from' as const,topN:1,thresholdBps:7000}};
 assert.deepEqual(executeRankedFlows(senders,input),recomputeRankedFlows(senders,input));assert.deepEqual(executeRankedFlows(senders,input).topAccounts,[{account:'a',amountCents:2,shareBps:6666}]);assert.equal(executeRankedFlows(senders,input).concentrated,false);
 const ties={...input,records:input.records.slice(1,3)};assert.deepEqual(executeRankedFlows(definition,ties).topAccounts.map(a=>a.account),['b','z']);
});
test('empty and zero-valued inputs never create a positive concentration flag or invalid shares',()=>{
 for(const records of [[],[{block:1,from:'zero',to:'zero',cents:0}]]){
  const d={...definition,recipe:{...definition.recipe,thresholdBps:0}},i={...input,records};
  const result=executeRankedFlows(d,i);assert.equal(result.concentrated,false);assert.equal(result.totalCents,0);assert.ok(result.topAccounts.every(a=>a.shareBps===0));assert.deepEqual(result,recomputeRankedFlows(d,i));
 }
});
test('bounded interpreters reject malformed records and unsafe totals independently',()=>{
 for(const records of [[{block:1,from:'x',to:'y',cents:Number.MAX_SAFE_INTEGER},{block:1,from:'x',to:'y',cents:1}],[{block:1,from:'x',to:'y',cents:-1}],[{block:1,from:'x',to:'y',cents:1,extra:true}],Array.from({length:101},()=>({block:1,from:'x',to:'y',cents:1}))]){
  assert.throws(()=>executeRankedFlows(definition,{...input,records}));assert.throws(()=>recomputeRankedFlows(definition,{...input,records}));
 }
});
test('provider conformance rejects changed details, extra fields and mutation of the committed definition',async()=>{
 assert.equal((await checkSkillConformance(definition,executeRankedFlows)).cases,4);
 await assert.rejects(checkSkillConformance(definition,(d,i)=>({...executeRankedFlows(d,i),extra:true})));
 await assert.rejects(checkSkillConformance(definition,(d,i)=>{const r=executeRankedFlows(d,i);if(r.topAccounts[0])r.topAccounts[0].shareBps++;return r;}));
 await assert.rejects(checkSkillConformance(definition,(d,i)=>{d.recipe.groupBy='from';return executeRankedFlows(d,i);}));
 assert.equal(definition.recipe.groupBy,'to');
});
test('full delivery commitments bind an extension recipe and independently reject rehashed ranking details',()=>{
 const records=input.records.filter(r=>r.block>=input.blockFrom&&r.block<=input.blockTo),datasetText=JSON.stringify(records),datasetHash=keccak256(stringToHex(datasetText)),taskId=keccak256(stringToHex('extension order')),verification=deliveryVerification(definition.id,{...input,skillDefinition:definition}),spec={datasetUrl:'https://evidence.example/dataset',artifactUrl:'https://evidence.example/artifact',datasetHash,verification};
 const artifact=deliveryArtifact(taskId,verification,datasetHash,executeRankedFlows(definition,input));
 assert.equal(verifyDelivery(datasetText,JSON.stringify(artifact),taskId,spec).accepted,true);
 const changed=structuredClone(artifact);(changed.output as RankedFlowOutput).topAccounts[0].shareBps++;changed.outputHash=resultHash(changed.output);
 assert.equal(verifyDelivery(datasetText,JSON.stringify(changed),taskId,spec).accepted,false);
 const newDefinition={...definition,recipe:{...definition.recipe,thresholdBps:7000}},next=deliveryVerification(definition.id,{...input,skillDefinition:newDefinition});
 assert.notEqual(specHash(spec),specHash({...spec,verification:next}));
 const changedRecipe=deliveryArtifact(taskId,next,datasetHash,executeRankedFlows(newDefinition,input));assert.equal(verifyDelivery(datasetText,JSON.stringify(changedRecipe),taskId,spec).accepted,false);
 assert.throws(()=>validateVerification({...verification,skill:'treasury-report'}));
 const missing=omitFields(verification,"skillDefinition");assert.throws(()=>validateVerification(missing));
});
test('installation is owner-state scoped, immutable, replay safe and does not grant execution permission',async()=>{
 let state=seed();const policy=structuredClone(state.policy),ledger=structuredClone(state.ledger);
 state=await transition(state,{type:'register_skill',definition});assert.deepEqual(state.policy,policy);assert.deepEqual(state.ledger,ledger);
 assert.deepEqual(await transition(state,{type:'register_skill',definition}),state);
 await assert.rejects(transition(state,{type:'register_skill',definition:{...definition,recipe:{...definition.recipe,topN:1}}}),/immutable/);
 await assert.rejects(transition(seed(),{type:'register_agent',requestId:'new',agent:{name:'Ranker',description:'Concentration analysis',skill:definition.id as `ext:${string}`}}),/Invalid agent/);
 state=await transition(state,{type:'register_agent',requestId:'new',agent:{name:'Ranker',description:'Concentration analysis',skill:definition.id as `ext:${string}`}});
 const command={type:'create_task' as const,requestId:'request',taskId:'task',agentId:'custom-new',title:'Concentration',budget:1000,scenario:'success' as const,input};
 let denied=await transition(state,command);denied=await transition(denied,{type:'advance',taskId:'task',expectedStep:0});assert.equal(denied.tasks[0].status,'blocked');assert.equal(denied.tasks[0].paid,0);
 state=await transition(state,{type:'update_policy',policy:{...state.policy,allowedSkills:[...state.policy.allowedSkills,definition.id as `ext:${string}`]}});
 state=await transition(state,command);for(let expectedStep=0;expectedStep<6;expectedStep++)state=await transition(state,{type:'advance',taskId:'task',expectedStep});
 assert.equal(state.tasks[0].status,'completed');assert.deepEqual(state.tasks[0].output,executeRankedFlows(definition,input));assert.deepEqual(await transition(state,command),state);
 const resolved=resolveSkillInput(state,definition.id as `ext:${string}`,input);assert.equal(resolved.skillDefinition?.id,definition.id);assert.notStrictEqual(resolved.skillDefinition,state.skillDefinitions![0]);
 assert.throws(()=>resolveSkillInput(seed(),definition.id as `ext:${string}`,resolved),/installed/);
 assert.throws(()=>resolveSkillInput(state,definition.id as `ext:${string}`,{...input,skillDefinition:{...definition,recipe:{...definition.recipe,thresholdBps:1}}}),/matching/);
 assert.throws(()=>resolveSkillInput(state,'event-analysis',resolved),/Built-in/);
 assert.deepEqual(expectedOutput({skill:definition.id as `ext:${string}`,input:resolved}),executeRankedFlows(definition,input));
 assert.throws(()=>authorizeOperation(definition.id as `ext:${string}`,'wallet.transfer',definition),/outside/);
});
