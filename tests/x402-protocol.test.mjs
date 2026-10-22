import test from 'node:test';import assert from 'node:assert/strict';
import {verifyMessage} from 'viem';
import {x402Fixture} from './x402-fixture.mjs';
import {checkX402Requirements} from '../lib/agentos/x402-policy.ts';
import {createPayload,decodePaymentRequiredHeader,encodePaymentSignatureHeader,reconcilePayment,authorizationABI} from '../scripts/x402/protocol.mjs';
import {reportMessage,startReportService} from '../scripts/x402/report-service.mjs';

test('official x402 EVM SDK pays a real 402 report once, binds its input and refuses replay or changed destinations',async()=>{
 const f=await x402Fixture();try{
  const url=f.report.base+'/v1/treasury-report',init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f.request)},challenge=await fetch(url,init);
  assert.equal(challenge.status,402);const required=decodePaymentRequiredHeader(challenge.headers.get('PAYMENT-REQUIRED')),requirements=checkX402Requirements(required.accepts[0],f.policy);
  let signatures=0;const payload=await createPayload(f.policy,requirements,required.resource,f.accounts[1],'pay_'+crypto.randomUUID(),async()=>{signatures++;});
  const headers={...init.headers,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)};
  const response=await fetch(url,{...init,headers});assert.equal(response.status,200,JSON.stringify({report:f.report.lastError(),facilitator:f.fac.lastError()}));const report=await response.json();assert.deepEqual(report.terms.output.allocations,{alice:125,bob:75});assert.equal(report.terms.inputHash,f.request.inputHash);assert.equal(await verifyMessage({address:f.policy.providerSigner,message:reportMessage(report.terms),signature:report.signature}),true);
  const proof=await reconcilePayment(f.client,f.token,payload);assert.equal(proof.amount,'200000');assert.equal(signatures,1);
  assert.equal(await f.client.readContract({address:f.token,abi:f.contracts.MockAuthorizationToken.abi,functionName:'balanceOf',args:[f.accounts[3].address]}),200000n);
  assert.equal((await fetch(url,{...init,headers})).status,200);
  assert.equal((await f.client.getContractEvents({address:f.token,abi:authorizationABI,eventName:'AuthorizationUsed',fromBlock:0n})).length,1);
  await assert.rejects(f.write(f.token,f.contracts.MockAuthorizationToken.abi,'transferWithAuthorization',[...Object.values(payload.payload.authorization).slice(0,6).map((v,i)=>[2,3,4].includes(i)?BigInt(v):v),payload.payload.signature]),/reverted/);
  const changed={...f.request,jobId:'0x'+'11'.repeat(32)};assert.equal((await fetch(url,{...init,headers,body:JSON.stringify(changed)})).status,409);
  assert.throws(()=>checkX402Requirements({...requirements,payTo:f.accounts[5].address},f.policy),/reviewed policy/);
  assert.throws(()=>checkX402Requirements({...requirements,amount:'200001'},f.policy),/reviewed policy/);
 }finally{await f.close();}
});

test('a settled x402 request survives dropped response and report-service restart without a second payment',async()=>{
 const f=await x402Fixture();let restarted;try{
  const url=f.report.base+'/v1/treasury-report',init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f.request)},challenge=await fetch(url,init),required=decodePaymentRequiredHeader(challenge.headers.get('PAYMENT-REQUIRED')),payload=await createPayload(f.policy,required.accepts[0],required.resource,f.accounts[1],'pay_'+crypto.randomUUID());
  await fetch(f.report.base+'/testing',{method:'POST',body:JSON.stringify({mode:'lost-response'})});const paid={...init,headers:{...init.headers,'PAYMENT-SIGNATURE':encodePaymentSignatureHeader(payload)}};
  await assert.rejects(fetch(url,paid));const first=await reconcilePayment(f.client,f.token,payload);assert.ok(first);
  await f.report.close();restarted=await startReportService({...f.serverOptions,port:Number(new URL(f.report.base).port)});
  const recovered=await fetch(url,paid);assert.equal(recovered.status,200);assert.equal((await reconcilePayment(f.client,f.token,payload)).transaction,first.transaction);
  assert.equal((await f.client.getContractEvents({address:f.token,abi:authorizationABI,eventName:'AuthorizationUsed',fromBlock:0n})).length,1);
 }finally{if(restarted){await restarted.close();f.report.close=async()=>{};}await f.close();}
});
