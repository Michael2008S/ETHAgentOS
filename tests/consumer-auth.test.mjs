import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {issueConsumer,listConsumers,revokeConsumer,authenticateConsumer,CONSUMER_HEADER} from '../lib/agentos/consumer-auth.ts';
import {owner} from '../lib/agentos/auth.ts';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');for(const migration of ['0000_parallel_roland_deschain','0001_chemical_famine','0002_dazzling_lady_bullseye','0003_purple_virginia_dare'])sqlite.exec(readFileSync('drizzle/'+migration+'.sql','utf8'));
 const database={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return {meta:sqlite.prepare(sql).run(...args)};}};}};}};
 const input=()=>({id:crypto.randomUUID(),name:'Recovery worker',ttlSeconds:3600,intervalMs:5000}),request=(token,path='/api/runtime/drain',headers={},method='POST')=>new Request('https://agentos.example'+path,{method,headers:{[CONSUMER_HEADER]:token,...headers}});
 return {sqlite,database,input,request};
}
test('consumer credentials store only hashes, bind one owner and never authorize owner APIs',async()=>{
 const f=fixture(),issued=await issueConsumer(f.database,'owner-a',f.input(),100000),metadata=await listConsumers(f.database,'owner-a');
 assert.equal(metadata.length,1);assert.equal(JSON.stringify(metadata).includes(issued.token),false);assert.equal((await listConsumers(f.database,'owner-b')).length,0);
 const row=f.sqlite.prepare('SELECT * FROM agentos_consumer_credentials').get();assert.equal(row.secret_hash.length,64);assert.equal(JSON.stringify(row).includes(issued.token.split('.')[1]),false);
 const authenticated=await authenticateConsumer(f.request(issued.token,'/api/runtime/drain',{'oai-authenticated-user-id':'owner-b'}),f.database,100001);assert.equal(authenticated.ownerId,'owner-a');assert.equal(authenticated.credential.lastUsedAt,new Date(100001).toISOString());
 await authenticateConsumer(f.request(issued.token,'/api/runtime/consumer-status',{},'GET'),f.database,100002);
 for(const path of ['/api/workspace','/api/command','/api/runtime/consumers','/api/runtime/queue']){await assert.rejects(authenticateConsumer(f.request(issued.token,path),f.database,100003),/fixed/);assert.throws(()=>owner(f.request(issued.token,path)),/owner APIs/);}
 f.sqlite.close();
});
test('consumer authentication refuses malformed, expired, revoked and cross-origin requests without fallback',async()=>{
 const f=fixture(),issued=await issueConsumer(f.database,'owner-a',f.input(),100000);
 for(const token of ['','bad',issued.token.slice(0,-1)+(issued.token.endsWith('a')?'b':'a'),'aos_rt_'+crypto.randomUUID()+'.'+'1'.repeat(64)])await assert.rejects(authenticateConsumer(f.request(token),f.database,100001),/invalid or inactive/);
 for(const [path,headers,method] of [['/api/runtime/drain?owner=owner-b',{},'POST'],['/api/runtime/drain',{origin:'https://agentos.example'},'POST'],['/api/runtime/drain',{'x-agentos-sandbox':'other'},'POST'],['/api/runtime/drain',{},'GET']])await assert.rejects(authenticateConsumer(f.request(issued.token,path,headers,method),f.database,100001),/fixed/);
 await assert.rejects(authenticateConsumer(f.request(issued.token),f.database,3700000),/inactive/);
 await assert.rejects(revokeConsumer(f.database,'owner-b',issued.credential.id,100002),/not found/);await authenticateConsumer(f.request(issued.token),f.database,100003);
 await revokeConsumer(f.database,'owner-a',issued.credential.id,100004);await revokeConsumer(f.database,'owner-a',issued.credential.id,100005);await assert.rejects(authenticateConsumer(f.request(issued.token),f.database,100006),/inactive/);
 assert.equal((await listConsumers(f.database,'owner-a'))[0].revokedAt,new Date(100004).toISOString());f.sqlite.close();
});
test('concurrent credential issuance is bounded, duplicate IDs cannot replace a secret, and revocation permits rotation',async()=>{
 const f=fixture(),input=f.input(),first=await issueConsumer(f.database,'owner',input,100000);await assert.rejects(issueConsumer(f.database,'owner',input,100000),/already issued/);
 const attempts=await Promise.allSettled(Array.from({length:8},()=>issueConsumer(f.database,'owner',f.input(),100000)));assert.equal(attempts.filter(r=>r.status==='fulfilled').length,4);assert.equal((await listConsumers(f.database,'owner')).length,5);
 await revokeConsumer(f.database,'owner',first.credential.id,100001);const replacement=await issueConsumer(f.database,'owner',f.input(),100002);assert.notEqual(replacement.token,first.token);assert.equal((await listConsumers(f.database,'other')).length,0);
 for(const patch of [{ttlSeconds:3599},{ttlSeconds:2592001},{intervalMs:999},{intervalMs:60001},{name:' '},{id:'unsafe-id'}])await assert.rejects(issueConsumer(f.database,'new-owner',{...f.input(),...patch},100003),/Invalid/);f.sqlite.close();
});
