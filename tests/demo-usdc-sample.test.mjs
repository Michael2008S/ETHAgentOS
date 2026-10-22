import test from 'node:test';import assert from 'node:assert/strict';
import {DataRPCError} from '../lib/agentos/chain-data.ts';
import {USDC_ADDRESS,TRANSFER_TOPIC} from '../lib/agentos/transfer-source.ts';
import {recentUSDCLogs} from '../scripts/demo-usdc-sample.mjs';

test('a busy finalized sample splits oversized responses and retains every block without overlaps or truncation',async()=>{
 const successful=[];
 const rpc=async(method,[filter])=>{assert.equal(method,'eth_getLogs');assert.equal(filter.address,USDC_ADDRESS);assert.deepEqual(filter.topics,[TRANSFER_TOPIC]);const from=Number(BigInt(filter.fromBlock)),to=Number(BigInt(filter.toBlock));if(to-from>1)throw new DataRPCError('limit',method);const blocks=Array.from({length:to-from+1},(_,i)=>from+i);successful.push(...blocks);return blocks.map(block=>({blockNumber:'0x'+block.toString(16)}));};
 const logs=await recentUSDCLogs(rpc,100,112);
 assert.deepEqual(logs.map(log=>Number(BigInt(log.blockNumber))),Array.from({length:13},(_,i)=>100+i));assert.equal(new Set(successful).size,13);assert.equal(successful.length,13);
});
test('one oversized block fails the whole sample instead of returning partial results',async()=>{
 const failure=new DataRPCError('limit','eth_getLogs');
 await assert.rejects(recentUSDCLogs(async(_method,[filter])=>{if(filter.toBlock==='0x65')throw failure;return [{blockNumber:filter.fromBlock}];},100,101),error=>error===failure);
});
test('transport failures and invalid envelopes cannot be hidden by block splitting',async()=>{
 const failure=new DataRPCError('transport','eth_getLogs');let calls=0;
 await assert.rejects(recentUSDCLogs(async()=>{calls++;throw failure;},100,112),error=>error===failure);assert.equal(calls,1);
 await assert.rejects(recentUSDCLogs(async()=>({result:[]}),100,112),/Invalid USDC log response/);
});
test('sampling is bounded before making any RPC call',async()=>{
 let calls=0;const rpc=async()=>{calls++;return [];};
 for(const [from,to]of [[-1,1],[1,14],[2,1],[0,NaN]])await assert.rejects(recentUSDCLogs(rpc,from,to),/13 recent finalized blocks/);
 assert.equal(calls,0);
});
