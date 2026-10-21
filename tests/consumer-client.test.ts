import test from 'node:test';
import assert from 'node:assert/strict';
import {createConsumerClient,ConsumerFailure} from '../lib/agentos/consumer-client.ts';
const token='aos_rt_'+crypto.randomUUID()+'.'+'1'.repeat(64),configuration={origin:'https://agentos.example',token,gatewayBearer:'private-gateway-secret'},queue={pending:0,leased:0,completed:1,dead:0},status={version:'agentos.consumer-status.v1',checkedAt:new Date().toISOString(),intervalMs:5000,expiresAt:new Date(Date.now()+3600000).toISOString(),consumer:'healthy',lastConsumerAt:new Date().toISOString(),oldestPendingAt:null,queue},drain={claimed:1,completed:1,rescheduled:0,failed:0,queue};
test('consumer transport fixes routes, separates gateway authentication and never sends workspace selection',async()=>{
 const calls:string[]=[],client=createConsumerClient(configuration,async(url,init)=>{calls.push(String(url));assert.equal(init?.redirect,'manual');assert.equal(init?.body,undefined);assert.equal(new Headers(init?.headers).get('x-agentos-consumer-token'),token);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-gateway-secret');return Response.json(init?.method==='GET'?status:drain);});
 assert.deepEqual(await client.status(),status);assert.deepEqual(await client.drain(),drain);assert.deepEqual(calls,['https://agentos.example/api/runtime/consumer-status','https://agentos.example/api/runtime/drain']);
});
test('consumer configuration refuses non-TLS remote hosts, embedded credentials and URL-selected endpoints',()=>{
 for(const origin of ['http://remote.example','https://secret@agentos.example','https://agentos.example/','https://agentos.example/?token=private','https://agentos.example/api/runtime/drain','not-a-url'])assert.throws(()=>createConsumerClient({...configuration,origin}),/Invalid consumer configuration/);
 assert.throws(()=>createConsumerClient({...configuration,token:'invalid'}));assert.throws(()=>createConsumerClient({...configuration,gatewayBearer:'bad\nheader'}));
 assert.doesNotThrow(()=>createConsumerClient({...configuration,origin:'http://127.0.0.1:5177'}));
});
test('authentication failures stop retries and errors never expose remote bodies, tokens or provider exceptions',async()=>{
 for(const code of [401,403,302,500]){const client=createConsumerClient(configuration,async()=>new Response('private-response-secret',{status:code}));await assert.rejects(client.drain(),error=>error instanceof ConsumerFailure&&error.kind===(code===401||code===403?'authentication':'unavailable')&&!error.message.includes('private'));}
 const client=createConsumerClient(configuration,async()=>{throw new Error(token);});await assert.rejects(client.status(),error=>error instanceof ConsumerFailure&&error.message==='Consumer service is unavailable.');
 const broken=createConsumerClient(configuration,async()=>new Response(new ReadableStream({start(controller){controller.error(new Error('private-stream-secret'));}})));await assert.rejects(broken.drain(),error=>error instanceof ConsumerFailure&&!error.message.includes('private'));
});
test('malformed, oversized and scope-bearing consumer responses fail closed',async()=>{
 for(const value of [{...status,ownerId:'do-not-expose'},{...status,intervalMs:999},{...status,queue:{...queue,dead:-1}},{...status,checkedAt:'yesterday'}])await assert.rejects(createConsumerClient(configuration,async()=>Response.json(value)).status(),ConsumerFailure);
 for(const value of [{...drain,claimed:5},{...drain,owner:'another'},{...drain,queue:{...queue,completed:1000001}}])await assert.rejects(createConsumerClient(configuration,async()=>Response.json(value)).drain(),ConsumerFailure);
 await assert.rejects(createConsumerClient(configuration,async()=>new Response('x'.repeat(16385))).status(),ConsumerFailure);
});
