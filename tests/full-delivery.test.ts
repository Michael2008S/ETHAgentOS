import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,stringToHex} from 'viem';
import {deliveryArtifact,deliveryVerification,resultHash,specHash,verifyDelivery} from '../cre/workflow/verify.ts';
import {seed,expectedOutput} from '../lib/agentos/engine.ts';
import {createOrder} from '../lib/agentos/orders.ts';

const id=keccak256(stringToHex('full-result')),address='0x1111111111111111111111111111111111111111' as const;
const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:3,records:[{block:1,from:'buyer',to:'alice',cents:100},{block:2,from:'buyer',to:'bob',cents:200},{block:3,from:'buyer',to:'alice',cents:50}]};
for(const skill of ['event-analysis','treasury-report'] as const)test(`full ${skill} acceptance rejects every changed field even with a recomputed hash`,()=>{
 const dataset=JSON.stringify(input.records),datasetHash=keccak256(stringToHex(dataset)),verification=deliveryVerification(skill,input),spec={datasetUrl:'https://data.example/a',artifactUrl:'https://output.example/a',datasetHash,verification},output=expectedOutput({skill,input}),artifact=deliveryArtifact(id,verification,datasetHash,output);
 const verify=(value:unknown)=>verifyDelivery(dataset,JSON.stringify(value),id,spec);
 assert.equal(verify(artifact).accepted,true);
 const variants=[{...output,dataset:'eth-shenzhen-fixture-v1'},{...output,blockFrom:0},{...output,blockTo:4},{...output,totalCents:351},{...output,transferCount:4},{...output,extra:'uncommitted'},skill==='event-analysis'?{...output,uniqueRecipients:999}:{...output,allocations:{alice:100,bob:250}}];
 for(const changed of variants)assert.equal(verify({...artifact,output:changed,outputHash:resultHash(changed)}).accepted,false);
 for(const changed of [{...artifact,taskId:'wrong'},{...artifact,datasetHash:id},{...artifact,outputHash:id},{...artifact,verification:{...verification,skillVersion:'2.0.0'}},{...artifact,extra:true},{taskId:id,totalCents:350,transferCount:3},null,[]])assert.equal(verify(changed).accepted,false);
 assert.throws(()=>verifyDelivery(dataset+' ',JSON.stringify(artifact),id,spec),/commitment/);
 assert.notEqual(specHash(spec),specHash({...spec,verification:{...verification,skill:skill==='event-analysis'?'treasury-report':'event-analysis'}}));
 assert.notEqual(specHash(spec),specHash({...spec,verification:{...verification,blockTo:4}}));
});

test('versioned acceptance handles zero records and special recipient names without prototype mutation',()=>{
 for(const rows of [[],[{block:1,from:'x',to:'__proto__',cents:10},{block:2,from:'x',to:'constructor',cents:20}]]){
  const value={...input,records:rows},dataset=JSON.stringify(rows),datasetHash=keccak256(stringToHex(dataset)),verification=deliveryVerification('treasury-report',value),spec={datasetUrl:'https://a.example',artifactUrl:'https://b.example',datasetHash,verification},artifact=deliveryArtifact(id,verification,datasetHash,expectedOutput({skill:'treasury-report',input:value}));
  assert.equal(verifyDelivery(dataset,JSON.stringify(artifact),id,spec).accepted,true);
 }
 const rows=[{block:0,from:'x',to:'a',cents:1}],dataset=JSON.stringify(rows),spec={datasetUrl:'https://a.example',artifactUrl:'https://b.example',datasetHash:keccak256(stringToHex(dataset)),verification:deliveryVerification('event-analysis',input)};
 assert.throws(()=>verifyDelivery(dataset,'{}',id,spec),/record/);
});

test('new orders refuse absent, downgraded or mismatched verification; historical commitments keep their original hash',async()=>{
 const verification=deliveryVerification('event-analysis',input),spec={datasetUrl:'https://a.example',artifactUrl:'https://b.example',datasetHash:id,verification},draft={requestId:crypto.randomUUID(),title:'Full delivery',agentId:'atlas',budget:1000,buyer:address,input,spec,scenario:'success' as const,timeoutSeconds:300},deployment={mode:'local' as const,chainId:31337,token:address,escrow:address,forwarder:address,metadataHash:id,confirmations:1,seller:address,deployedBlock:'0'};
 await createOrder(seed(),draft,deployment);
 for(const value of [undefined,{...verification,skill:'treasury-report' as const},{...verification,blockFrom:0}])await assert.rejects(createOrder(seed(),{...draft,spec:{...spec,verification:value}},deployment),/commitment/);
 const legacy={datasetUrl:spec.datasetUrl,artifactUrl:spec.artifactUrl,datasetHash:id};
 assert.equal(specHash(legacy),keccak256(stringToHex('{"artifactUrl":"https://b.example","datasetHash":"'+id+'","datasetUrl":"https://a.example"}')));
 const bytes='[{"cents":100}]',hash=keccak256(stringToHex(bytes));
 assert.equal(verifyDelivery(bytes,JSON.stringify({taskId:id,totalCents:100,transferCount:1}),id,hash).accepted,true);
 assert.equal(verifyDelivery(bytes,JSON.stringify({taskId:id,totalCents:100,transferCount:1,allocations:{wrong:100}}),id,hash).accepted,false);
});
