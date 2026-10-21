import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {inputEvidence} from '../sdk/wallet.ts';
import {deliveryArtifact} from '../cre/workflow/verify.ts';
import {expectedOutput} from '../lib/agentos/engine.ts';
import {publishCREFixture} from '../scripts/cre-evidence-fixture.mjs';
const fixture={origin:'https://synthetic.example',token:'synthetic-fixture-write-token-0123456789'},escrow='0x'+'22'.repeat(20),buyer='0x'+'33'.repeat(20),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'synthetic-treasury',to:'synthetic-member',cents:123}]};
const evidence=()=>{const bytes=inputEvidence({id:'chain-'+crypto.randomUUID(),skill:'event-analysis',input},buyer);return {bytes,artifact:JSON.stringify(deliveryArtifact(bytes.id,bytes.verification,bytes.datasetHash,expectedOutput({skill:'event-analysis',input})))};};
test('owned CRE evidence survives lost publication and transient read failures without changing immutable bytes or leaking writer authority',async()=>{
 const bundle=await build({entryPoints:['services/evidence/worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'}),worker=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',r2Buckets:['BUCKET'],bindings:{PUBLIC_ORIGIN:fixture.origin,ESCROW_ADDRESS:escrow,WRITE_TOKEN:fixture.token},host:'127.0.0.1',port:0}),{bytes,artifact}=evidence(),calls=[];let lose=true,unavailable=true;
 const request=async(url,init)=>{calls.push({url,method:init.method,headers:new Headers(init.headers),body:init.body});if(init.method==='GET'&&unavailable){unavailable=false;return new Response(null,{status:503});}const response=await worker.dispatchFetch(url,init);if(init.method==='POST'&&String(url).endsWith('/drafts')&&lose){lose=false;await response.arrayBuffer();throw Error('Lost response with '+fixture.token);}return response;};
 try{
  const proof=await publishCREFixture(fixture,escrow,bytes,artifact,{request,pause:async()=>{}});assert.equal(proof.requests.filter(r=>r.outcome==='unavailable').length,2);assert.equal(proof.requests.filter(r=>r.outcome==='verified').length,4);assert.equal(calls.filter(c=>c.method==='GET').every(c=>!c.headers.has('authorization')),true);assert.equal(calls.every(c=>new URL(c.url).origin===fixture.origin),true);const writes=calls.filter(c=>c.url.endsWith('/drafts'));assert.equal(writes.length,2);assert.equal(writes[0].body,writes[1].body);assert.equal(JSON.stringify(proof).includes(fixture.token),false);assert.equal(proof.spec.artifactUrl.includes('base64'),false);
  assert.equal(await(await worker.dispatchFetch(proof.spec.artifactUrl)).text(),artifact);const changed=JSON.parse(artifact);changed.output.totalCents++;let conflicts=0;await assert.rejects(publishCREFixture(fixture,escrow,bytes,JSON.stringify(changed),{request:async(url,init)=>{const response=await worker.dispatchFetch(url,init);if(response.status===409)conflicts++;return response;},pause:async()=>{}}),/artifact-publication failed after 1 attempt.*HTTP 409/);assert.equal(conflicts,1);assert.equal(await(await worker.dispatchFetch(proof.spec.artifactUrl)).text(),artifact);
 }finally{await worker.dispose();}
});
test('CRE fixture refuses redirected or changed specifications, bounds transport retries and reports no raw provider credentials',async()=>{
 const {bytes,artifact}=evidence();let calls=0;
 await assert.rejects(publishCREFixture(fixture,escrow,bytes,artifact,{request:async()=>{calls++;throw Error('private transport '+fixture.token);},pause:async()=>{}}),error=>{assert.match(error.message,/input-publication failed after 3 attempt/);assert.equal(error.message.includes(fixture.token),false);return true;});assert.equal(calls,3);
 for(const response of [new Response(null,{status:302,headers:{Location:'https://attacker.example'}}),Response.json({spec:{datasetUrl:'https://attacker.example'}}),new Response('x'.repeat(131073))]){let count=0;await assert.rejects(publishCREFixture(fixture,escrow,bytes,artifact,{request:async(_url,init)=>{count++;assert.equal(init.redirect,'manual');return response;},pause:async()=>{}}),/failed after 1 attempt/);assert.equal(count,1);}
 await assert.rejects(publishCREFixture({...fixture,origin:'http://127.0.0.1:1'},escrow,bytes,artifact),/not configured/);
});
