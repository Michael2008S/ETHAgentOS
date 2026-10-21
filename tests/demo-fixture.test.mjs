import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLocalDemoFunds} from '../scripts/demo-fixture.mjs';
test('demo fixture funding refuses public chains and non-loopback endpoints before requesting a wallet or token transfer',async()=>{
 const original=globalThis.fetch;let requests=0;
 try{
  globalThis.fetch=async input=>{assert.equal(input,'http://127.0.0.1:8955/config');requests++;return Response.json({mode:'testnet',chainId:11155111});};
  await assert.rejects(prepareLocalDemoFunds('https://public.example'),/plain 127.0.0.1/);assert.equal(requests,0);
  await assert.rejects(prepareLocalDemoFunds('http://127.0.0.1:8955'),/restricted to local chain/);assert.equal(requests,1);
  globalThis.fetch=async()=>{requests++;return Response.json({mode:'local',chainId:1});};await assert.rejects(prepareLocalDemoFunds('http://127.0.0.1:8955'),/restricted to local chain/);assert.equal(requests,2);
 }finally{globalThis.fetch=original;}
});
