import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256,stringToHex,type Hex} from 'viem';
import {validateConfig} from '../cre/workflow/config.ts';
import {evidenceRoot,selectReadyIds,validateReadyBatch,READY_LIMIT,type DispatcherConfig} from '../cre/workflow/dispatcher.ts';
import {deliveryVerification} from '../cre/workflow/verify.ts';
const c:DispatcherConfig={mode:'dispatcher',schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:'0x'+'11'.repeat(20) as Hex,gasLimit:'500000',evidenceOrigin:'https://evidence.example'};
const id=(i:number)=>'0x'+i.toString(16).padStart(64,'0') as Hex;
test('dispatcher configuration binds one service and escrow without per-order configuration',()=>{
 assert.deepEqual(validateConfig(c),c);
 for(const patch of [{taskId:id(1)},{spec:{}},{mode:'queue'},{chainName:'ethereum-mainnet'},{evidenceOrigin:'http://localhost:9000'},{evidenceOrigin:'https://secret:token@evidence.example'},{evidenceOrigin:'https://evidence.example/v1'},{evidenceOrigin:'https://evidence.example?token=x'},{evidenceOrigin:'https://evidence.example#x'}])assert.throws(()=>validateConfig({...c,...patch}));
});
test('bounded rotating batches cover all stable pending tasks, reject poison indices and do not repeat one task within a round',()=>{
 const ids=Array.from({length:7},(_,i)=>id(i+1)),visited=Array.from({length:4},(_,slot)=>selectReadyIds(ids,slot)).flat();assert.deepEqual(visited,ids);assert.deepEqual(selectReadyIds(ids,4),selectReadyIds(ids,0));assert.deepEqual(selectReadyIds([],100),[]);
 for(const ids of [[id(2),id(1)],[id(1),id(1)],[id(0)],Array.from({length:READY_LIMIT+1},(_,i)=>id(i+1))])assert.throws(()=>selectReadyIds(ids,0));
 assert.throws(()=>selectReadyIds([id(1)],-1));
});
test('feed validation refuses origin escape, changed scope, duplicates, excessive batches and legacy acceptance',()=>{
 const root=evidenceRoot(c.evidenceOrigin,c.escrowAddress),taskId=id(1),datasetHash=keccak256(stringToHex('[]')),spec={datasetUrl:root+'/dataset/'+datasetHash,artifactUrl:root+'/artifact/'+taskId,datasetHash,verification:deliveryVerification('event-analysis',{dataset:'custom-transfers-v1',blockFrom:0,blockTo:0})},batch={version:'agentos.ready.v1',chainId:11155111,escrow:c.escrowAddress,slot:12,total:1,indexHash:id(9),items:[{taskId,spec}]};
 assert.deepEqual(validateReadyBatch(batch,c,12),batch);
 for(const patch of [{slot:13},{chainId:1},{escrow:'0x'+'22'.repeat(20)},{total:65},{total:0},{items:[]},{items:[batch.items[0],batch.items[0]],total:2},{items:Array(3).fill(batch.items[0]),total:3},{items:[{taskId,spec:{...spec,datasetUrl:'https://attacker.example/data'}}]},{items:[{taskId,spec:{...spec,artifactUrl:root+'/artifact/'+id(2)}}]},{items:[{taskId,spec:{...spec,verification:undefined}}]}])assert.throws(()=>validateReadyBatch({...batch,...patch},c,12));
});
