import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {createEvidenceService} from '../lib/agentos/evidence-publisher.ts';
import {inputEvidence} from '../sdk/wallet.ts';
import {deliveryArtifact,canonical} from '../cre/workflow/verify.ts';
import {expectedOutput} from '../lib/agentos/engine.ts';
import {creIdentityHash,creWorkflowName} from '../sdk/cre-receiver.ts';
import {evidenceRoot,validateReadyBatch} from '../cre/workflow/dispatcher.ts';
const origin='https://evidence.example',token='synthetic-test-write-token-0123456789',escrow='0x'+'22'.repeat(20),buyer='0x'+'33'.repeat(20),receiver={format:'cre-v1',workflowId:'0x'+'44'.repeat(32),workflowOwner:'0x'+'55'.repeat(20),workflowName:creWorkflowName('evidence-test')},deployment={mode:'testnet',chainId:11155111,escrow,token:buyer,forwarder:buyer,seller:buyer,confirmations:2,metadataHash:creIdentityHash(receiver.workflowName,receiver.workflowOwner),deployedBlock:'0',receiver};

test('conditional R2 publication preserves immutable input/artifacts with public reads and authenticated retry-safe writes',async()=>{
 const bundle=await build({entryPoints:['services/evidence/worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',r2Buckets:['BUCKET'],bindings:{PUBLIC_ORIGIN:origin,ESCROW_ADDRESS:escrow,WRITE_TOKEN:token},host:'127.0.0.1',port:0});
 try{
  const calls=[];
  const request=async(url,init)=>{calls.push({url:String(url),method:init?.method??'GET',authorization:new Headers(init?.headers).get('authorization')});return mf.dispatchFetch(String(url),init);};
  const service=createEvidenceService(JSON.stringify({origin}),token,deployment,request),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'a',to:'b',cents:123},{block:2,from:'a',to:'c',cents:456}]},bytes=inputEvidence({id:'chain-'+crypto.randomUUID(),input,skill:'event-analysis'},buyer);
  const specifications=await Promise.all(Array.from({length:4},()=>service.prepare(bytes))),spec=specifications[0];assert.ok(specifications.every(s=>canonical(s)===canonical(spec)));
  assert.equal(calls.filter(c=>c.method==='GET').every(c=>c.authorization===null),true,'anonymous reads must not inherit the writer token');assert.equal(calls.filter(c=>c.method==='POST').every(c=>c.authorization==='Bearer '+token),true);
  const notReady=await request(spec.artifactUrl);assert.equal(notReady.status,404);assert.equal(notReady.headers.get('cache-control'),'no-store');
  const alteredInput={...input,records:[{block:1,from:'a',to:'b',cents:999}]},conflict=inputEvidence({id:'chain-'+crypto.randomUUID(),input:alteredInput,skill:'event-analysis'},buyer);conflict.id=bytes.id;
  await assert.rejects(service.prepare(conflict),/Immutable evidence conflicts/);
  assert.equal(await(await request(spec.datasetUrl)).text(),bytes.datasetText);
  const artifact=JSON.stringify(deliveryArtifact(bytes.id,bytes.verification,bytes.datasetHash,expectedOutput({skill:'event-analysis',input})));
  await Promise.all(Array.from({length:4},()=>service.publish(bytes.id,spec,artifact)));assert.equal(await(await request(spec.artifactUrl)).text(),artifact);assert.match((await request(spec.artifactUrl)).headers.get('cache-control'),/immutable/);
  const forged=JSON.parse(artifact);forged.output.totalCents++;await assert.rejects(service.publish(bytes.id,spec,JSON.stringify(forged)),/Immutable evidence conflicts/);assert.equal(await(await request(spec.artifactUrl)).text(),artifact);
  const body={id:bytes.id,chainId:11155111,escrow,datasetText:bytes.datasetText,verification:bytes.verification},post=(value,extra={},path='/v1/drafts')=>mf.dispatchFetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...extra},body:JSON.stringify(value)});
  assert.equal((await post(body,{Authorization:''})).status,401);assert.equal((await post(body,{Origin:'https://attacker.example'})).status,403);assert.equal((await post({...body,escrow:buyer})).status,400);assert.equal((await post(null)).status,400);assert.equal((await post({...body,datasetText:'x'.repeat(140000)})).status,413);
  const noQuery=await request(spec.datasetUrl+'?download=1');assert.equal(noQuery.status,400);assert.equal((await mf.dispatchFetch(origin+'/v1/11155111/'+buyer+'/dataset/'+bytes.datasetHash)).status,404);
  // An unrelated origin returned by a writer never becomes a fetch target.
  const untrusted=createEvidenceService(JSON.stringify({origin}),token,deployment,async()=>Response.json({spec:{...spec,datasetUrl:'https://attacker.example/private'}}));await assert.rejects(untrusted.prepare(bytes),/changed the committed specification/);
  const redirect=createEvidenceService(JSON.stringify({origin}),token,deployment,async()=>new Response(null,{status:302,headers:{Location:'https://attacker.example'}}));await assert.rejects(redirect.prepare(bytes),/unavailable/);
  assert.throws(()=>createEvidenceService(JSON.stringify({origin:'http://127.0.0.1:9000'}),token,deployment),/not configured/);assert.throws(()=>createEvidenceService(JSON.stringify({origin}),undefined,deployment),/not configured/);
  const root=evidenceRoot(origin,escrow),config={mode:'dispatcher',schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:escrow,gasLimit:'500000',evidenceOrigin:origin},ready=async slot=>{const response=await request(root+'/ready?slot='+slot);assert.equal(response.status,200);return validateReadyBatch(await response.json(),config,slot);};
  assert.equal((await ready(0)).total,1);assert.equal((await ready(0)).items[0].taskId,bytes.id);
  await Promise.all([service.complete(bytes.id,spec),service.complete(bytes.id,spec),service.publish(bytes.id,spec,artifact)]);assert.equal((await ready(0)).total,0);assert.equal(await(await request(spec.artifactUrl)).text(),artifact,'archival must preserve immutable proof bytes');
  await service.publish(bytes.id,spec,artifact);assert.equal((await ready(0)).total,0,'a late publication retry cannot resurrect an archived task');
  const prepared=await Promise.all(Array.from({length:8},async()=>{const b=inputEvidence({id:'chain-'+crypto.randomUUID(),input,skill:'event-analysis'},buyer),s=await service.prepare(b),a=JSON.stringify(deliveryArtifact(b.id,b.verification,b.datasetHash,expectedOutput({skill:'event-analysis',input})));await service.publish(b.id,s,a);return {bytes:b,spec:s,artifact:a};}));
  const batches=await Promise.all([0,1,2,3].map(ready));assert.ok(batches.every(b=>b.total===8));assert.deepEqual(batches.flatMap(b=>b.items.map(i=>i.taskId)).sort(),prepared.map(p=>p.bytes.id).sort(),'concurrent ready additions must not be lost');
  await Promise.all(prepared.map(p=>service.complete(p.bytes.id,p.spec)));assert.equal((await ready(0)).total,0);
  assert.equal((await post({chainId:11155111,escrow,id:bytes.id,specHash:'0x'+'00'.repeat(32)},{},'/v1/complete')).status,400);
  assert.equal((await request(root+'/ready?slot=0&slot=1')).status,400);assert.equal((await request(root+'/ready')).status,400);
 }finally{await mf.dispose();}
});
