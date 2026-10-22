import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';import {build} from 'esbuild';
import {inputEvidence} from '../sdk/wallet.ts';import {deliveryArtifact,specHash,canonical} from '../cre/workflow/verify.ts';import {expectedOutput} from '../lib/agentos/engine.ts';
import {d1EvidenceBucket} from '../services/evidence/d1-bucket.ts';
test('D1-backed public evidence keeps exact bytes, immutable conflicts and concurrent ready updates without R2',async()=>{
 const origin='https://d1-evidence.example',escrow='0x'+'2'.repeat(40),token='synthetic-d1-writer-token-0123456789';
 const bundle=await build({entryPoints:['services/evidence/d1-worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}),mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{PUBLIC_ORIGIN:origin,ESCROW_ADDRESS:escrow,WRITE_TOKEN:token},host:'127.0.0.1',port:0});
 try{
  const db=await mf.getD1Database('DB');await db.prepare(await readFile('services/evidence/d1-schema.sql','utf8')).run();
  const bucket=d1EvidenceBucket(db);await assert.rejects(bucket.put('invalid','body',{}),/Unconditional/);
  const first=await bucket.put('cas','a',{onlyIf:new Headers({'If-None-Match':'*'})});assert.ok(first);assert.equal(await bucket.put('cas','b',{onlyIf:new Headers({'If-None-Match':'*'})}),null);
  assert.equal(await bucket.put('cas','c',{onlyIf:{etagMatches:'stale'}}),null);assert.ok(await bucket.put('cas','b',{onlyIf:{etagMatches:first.etag}}));assert.equal((await bucket.get('cas')).body,'b');
  const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'synthetic-a',to:'synthetic-b',cents:123}]};
  const post=(path,body,extra={})=>mf.dispatchFetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...extra},body:JSON.stringify({chainId:11155111,escrow,...body})});
  const records=await Promise.all(Array.from({length:8},async()=>{
   const bytes=inputEvidence({id:crypto.randomUUID(),input,skill:'event-analysis'},'0x'+'3'.repeat(40)),body={id:bytes.id,datasetText:bytes.datasetText,verification:bytes.verification};
   assert.equal((await post('/v1/drafts',body,{Authorization:''})).status,401);assert.equal((await post('/v1/drafts',body,{Origin:'https://browser.example'})).status,403);
   const drafts=await Promise.all(Array.from({length:3},()=>post('/v1/drafts',body)));assert.ok(drafts.every(r=>r.status===200));const spec=(await drafts[0].json()).spec;
   const artifact=JSON.stringify(deliveryArtifact(bytes.id,bytes.verification,bytes.datasetHash,expectedOutput({skill:'event-analysis',input}))),write={id:bytes.id,specHash:specHash(spec),artifactText:artifact};
   const publications=await Promise.all(Array.from({length:3},()=>post('/v1/artifacts',write)));assert.ok(publications.every(r=>r.status===200));
   assert.equal((await post('/v1/artifacts',{...write,artifactText:JSON.stringify({...JSON.parse(artifact),tamper:true})})).status,409);
   const result=await mf.dispatchFetch(spec.artifactUrl);assert.equal(await result.text(),artifact);assert.match(result.headers.get('cache-control'),/immutable/);assert.equal(await(await mf.dispatchFetch(spec.datasetUrl)).text(),bytes.datasetText);return {bytes,spec,artifact,write};
  }));
  const batches=await Promise.all([0,1,2,3].map(async slot=>(await(await mf.dispatchFetch(origin+'/v1/11155111/'+escrow+'/ready?slot='+slot)).json())));assert.ok(batches.every(b=>b.total===8));assert.deepEqual(batches.flatMap(b=>b.items.map(i=>i.taskId)).sort(),records.map(r=>r.bytes.id).sort());
  await Promise.all(records.map(r=>post('/v1/complete',{id:r.bytes.id,specHash:specHash(r.spec)}).then(response=>assert.equal(response.status,200))));
  const ready=await(await mf.dispatchFetch(origin+'/v1/11155111/'+escrow+'/ready?slot=0')).json();assert.equal(ready.total,0);
  for(const r of records){assert.equal((await post('/v1/artifacts',r.write)).status,200);assert.equal(await(await mf.dispatchFetch(r.spec.artifactUrl)).text(),r.artifact);}
  assert.equal((await(await mf.dispatchFetch(origin+'/v1/11155111/'+escrow+'/ready?slot=0')).json()).total,0);
  assert.equal(canonical((await(await mf.dispatchFetch(origin+'/v1/config')).json()).escrow),canonical(escrow));
 }finally{await mf.dispose();}
});
