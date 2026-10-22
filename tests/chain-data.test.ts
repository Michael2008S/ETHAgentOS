import test from 'node:test';
import assert from 'node:assert/strict';
import {USDC_ADDRESS,TRANSFER_TOPIC,parseTransferSource,sourceRecords,sourceCommitment} from '../lib/agentos/transfer-source.ts';
import {dataRpc,importTransfers,verifyTransferSource} from '../lib/agentos/chain-data.ts';
import {normalizeInput,expectedOutput} from '../lib/agentos/engine.ts';
import {deliveryBytes} from '../sdk/wallet.ts';
import {verifyDelivery,deliveryVerification} from '../cre/workflow/verify.ts';
import type {Task} from '../lib/agentos/types.ts';
const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),account='0x'+'a'.repeat(40),to='0x'+'b'.repeat(40),topic=(a:string)=>'0x'+'0'.repeat(24)+a.slice(2);
const rawLog={address:USDC_ADDRESS,blockNumber:'0xa',blockHash:hash(10),transactionHash:hash(99),logIndex:'0x0',topics:[TRANSFER_TOPIC,topic(account),topic(to)],data:hash(1234567),removed:false};
const source=()=>parseTransferSource({version:'agentos.ethereum-usdc.v1',chainId:1,token:USDC_ADDRESS,decimals:6,account,direction:'outgoing',blockFrom:10,blockTo:10,finalized:{number:10,hash:hash(10)},blocks:[{number:10,hash:hash(10)}],logs:[{address:USDC_ADDRESS,blockNumber:10,blockHash:hash(10),transactionHash:hash(99),logIndex:0,topics:rawLog.topics,data:rawLog.data}]});
function provider(patch:Record<string,unknown>={}){
 const calls:{method:string;params:unknown[]}[]=[];
 const request:typeof fetch=async(url,init)=>{
  assert.equal(url,'https://data.example/');assert.equal(init?.redirect,'manual');const body=JSON.parse(String(init?.body));calls.push(body);
  const result=body.method in patch?patch[body.method]:body.method==='eth_chainId'?'0x1':body.method==='eth_call'?hash(6):body.method==='eth_getLogs'?[rawLog]:{number:'0xa',hash:hash(10)};
  return Response.json({jsonrpc:'2.0',id:1,result});
 };return {request,calls};
}
test('real-source import preserves exact base units, account-filtered complete logs and finality, without signing',async()=>{
 const p=provider(),input=await importTransfers('https://data.example',{account,direction:'outgoing'},p.request);
 assert.deepEqual(input.source,source());assert.equal(input.records[0].cents,123);
 const output=expectedOutput({input:normalizeInput(input),skill:'treasury-report'});
 assert.equal((output.source as {totalBaseUnits:string}).totalBaseUnits,'1234567');
 assert.equal((output.source as {roundingRemainderBaseUnits:string}).roundingRemainderBaseUnits,'4567');
 assert.deepEqual((output.source as {allocationsBaseUnits:unknown}).allocationsBaseUnits,{[to]:'1234567'});
 assert.ok(p.calls.every(c=>!c.method.includes('send')&&!c.method.includes('sign')));
 assert.deepEqual((p.calls.find(c=>c.method==='eth_getLogs')!.params[0] as {topics:unknown}).topics,[TRANSFER_TOPIC,topic(account)]);
 await verifyTransferSource('https://data.example',input.source,p.request);
});
test('source importer rejects wrong chain, pending ranges, too many logs, redirects, removed and reorged data',async()=>{
 for(const patch of [{eth_chainId:'0x2'},{eth_call:hash(18)},{eth_getLogs:[{...rawLog,removed:true}]},{eth_getLogs:[]},{eth_getLogs:Array.from({length:26},(_,i)=>({...rawLog,logIndex:'0x'+i.toString(16)}))}])await assert.rejects(importTransfers('https://data.example',{account,direction:'outgoing'},provider(patch).request));
 await assert.rejects(importTransfers('https://data.example',{account,direction:'outgoing',blockTo:11},provider().request),/finalized/);
 await assert.rejects(verifyTransferSource('https://data.example',source(),provider({eth_getBlockByNumber:{number:'0xa',hash:hash(11)}}).request),/canonical/);
 await assert.rejects(dataRpc('https://data.example',async()=>new Response(null,{status:302}))('eth_chainId',[]));
 for(const endpoint of ['http://127.0.0.1','https://secret@data.example','https://data.example?key=secret'])assert.throws(()=>dataRpc(endpoint));
});
test('full delivery binds raw provenance and exact amounts, and refuses edited records or swapped source',()=>{
 const provenance=source(),input=normalizeInput({dataset:'custom-transfers-v1',blockFrom:10,blockTo:10,records:sourceRecords(provenance),source:provenance}),output=expectedOutput({input,skill:'treasury-report'}),task={id:'actual-source',input,output,skill:'treasury-report'} as Task;
 const bytes=deliveryBytes(task,account as `0x${string}`),spec={datasetUrl:'https://a.example',artifactUrl:'https://b.example',datasetHash:bytes.datasetHash,verification:bytes.verification};
 assert.equal(verifyDelivery(bytes.datasetText,bytes.artifactText,bytes.id,spec).accepted,true);
 assert.equal(spec.verification?.sourceHash,sourceCommitment(provenance));
 assert.throws(()=>normalizeInput({...input,records:[{...input.records![0],cents:999}]}),/provenance/);
 assert.throws(()=>normalizeInput({...input,source:{...provenance,logs:[{...provenance.logs[0],blockHash:hash(11)}]}}),/provenance/);
 const changed=JSON.parse(bytes.artifactText);changed.output.source.totalBaseUnits='1230000';
 assert.equal(verifyDelivery(bytes.datasetText,JSON.stringify(changed),bytes.id,spec).accepted,false);
 assert.notDeepEqual(deliveryVerification('treasury-report',{...input,source:undefined}),spec.verification);
});

test('read-only RPC retries transport failures, prefers a working fallback and never retries oversized payloads',async()=>{
 const calls:string[]=[];let fail=true;const request:typeof fetch=async(url,init)=>{calls.push(String(url));if(String(url).includes('primary')&&fail)return new Response(null,{status:503});return Response.json({jsonrpc:'2.0',id:1,result:'0x1'});};
 const rpc=dataRpc(['https://primary.example','https://fallback.example'],request);assert.equal(await rpc('eth_chainId',[]),'0x1');assert.equal(await rpc('eth_chainId',[]),'0x1');assert.deepEqual(calls,['https://primary.example/','https://fallback.example/','https://fallback.example/']);await assert.rejects(rpc('eth_sendRawTransaction',[]),/Read-only/);
 let attempts=0;await assert.rejects(dataRpc('https://rpc.example',async()=>{attempts++;return new Response('x'.repeat(1000001));})('eth_getLogs',[]),/exceeds limit/);assert.equal(attempts,1);
});
