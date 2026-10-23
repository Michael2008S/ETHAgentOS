import test from 'node:test';import assert from 'node:assert/strict';
import {x402Fixture} from './x402-fixture.mjs';import {startFacilitator} from '../scripts/x402/facilitator.mjs';import {startReportService} from '../scripts/x402/report-service.mjs';import {Journal} from '../scripts/x402/storage.mjs';import {ProcurementStore} from '../scripts/x402/procurement-store.mjs';import {procurementClient} from '../scripts/x402/client.mjs';import {authorizationABI} from '../scripts/x402/protocol.mjs';
for(const failure of ['after-broadcast','disk-before-broadcast','disk-after-broadcast'])test('joint restart retains one payment and accounts gas after '+failure,async()=>{
 const f=await x402Fixture();let fac,report,store;
 try{
  const facPort=new URL(f.fac.base).port,reportPort=new URL(f.report.base).port;await f.report.close();await f.fac.close();
  const journal=new Journal(f.root+'/facilitator.sqlite'),put=journal.put.bind(journal);let triggered=false;
  journal.put=(ns,id,row)=>{if(failure==='disk-before-broadcast'&&!triggered&&ns==='gas'&&row.stage==='signed'){triggered=true;journal.db.exec('PRAGMA query_only=ON');}return put(ns,id,row);};
  fac=await startFacilitator({...f.facilitatorOptions,port:Number(facPort),journal,afterBroadcast:async()=>{if(failure==='after-broadcast')throw Error('Crash after broadcast before outcome persistence.');if(failure==='disk-after-broadcast'){triggered=true;journal.db.exec('PRAGMA query_only=ON');}}});
  report=await startReportService({...f.serverOptions,port:Number(reportPort)});store=new ProcurementStore(f.root+'/procurement.sqlite');const policy={...f.policy,maxTransportRetries:1},options={policy,account:f.accounts[1],client:f.client,store,authorize:async()=>({})},before=await f.client.getBalance({address:f.accounts[2].address});
  await assert.rejects(procurementClient(options).execute(f.request,'ticket'));
  const row=store.get('purchases',f.request.jobId),nonce=row.payload.payload.authorization.nonce;assert.ok(BigInt(row.amount)>0n);assert.equal(store.summary().purchases,1);assert.equal(store.summary().spent==='0',failure==='disk-before-broadcast');
  const gasRows=journal.rows('gas');assert.equal(gasRows.length,1);assert.equal(gasRows[0].receipt,undefined);assert.ok(BigInt(gasRows[0].reservedWei)>0n);if(failure!=='disk-before-broadcast'){assert.ok(gasRows[0].raw);assert.ok(gasRows[0].transaction);}
  await report.close();report=undefined;await fac.close();fac=undefined;store.close();store=undefined;
  fac=await startFacilitator({...f.facilitatorOptions,port:Number(facPort)});report=await startReportService({...f.serverOptions,port:Number(reportPort)});store=new ProcurementStore(f.root+'/procurement.sqlite');
  const result=await procurementClient({...options,store}).execute(f.request,'ticket');assert.equal(result.report.terms.nonce,nonce);assert.equal((await f.client.getContractEvents({address:f.token,abi:authorizationABI,eventName:'AuthorizationUsed',args:{authorizer:f.accounts[1].address,nonce},fromBlock:0n})).length,1);
  const gas=await(await fetch(fac.base+'/gas')).json();assert.equal(gas.transactions,1);assert.equal(gas.reservedWei,'0');assert.equal(BigInt(gas.spentWei),before-await f.client.getBalance({address:f.accounts[2].address}));assert.equal(store.summary().spent,'200000');
 }finally{if(report)await report.close();if(fac)await fac.close();store?.close();await f.close();}
});

test('unknown native gas stays reserved during RPC outage and reconciles without rebroadcast',async()=>{
 const {durableGasSender}=await import('../scripts/x402/gas-journal.mjs'),f=await x402Fixture(),journal=new Journal(f.root+'/unknown-gas.sqlite');let unavailable=false;
 try{const before=await f.client.getBalance({address:f.accounts[2].address}),client={...f.client,getTransactionReceipt:args=>{if(unavailable)throw Error('RPC observation unavailable');return f.client.getTransactionReceipt(args);}},gas=durableGasSender({client,wallet:f.walletFor(f.accounts[2]),journal,dailyGasWei:7500000000000000n,afterBroadcast:async()=>{unavailable=true;throw Error('Lost broadcast outcome');}}),args={address:f.token,abi:f.contracts.MockAuthorizationToken.abi,functionName:'mint',args:[f.accounts[1].address,1n]};
 await assert.rejects(gas.send('writeContract',args));await gas.reconcile();assert.equal(gas.summary().spentWei,'0');assert.equal(gas.summary().reservedWei,'7500000000000000');await assert.rejects(gas.send('writeContract',{...args,args:[f.accounts[1].address,2n]}),/gas cap/);
 unavailable=false;await gas.reconcile();assert.equal(gas.summary().transactions,1);assert.equal(gas.summary().reservedWei,'0');assert.equal(BigInt(gas.summary().spentWei),before-await f.client.getBalance({address:f.accounts[2].address}));const hash=journal.rows('gas')[0].transaction;assert.equal(await gas.send('writeContract',args),hash);assert.equal(gas.summary().transactions,1);
 }finally{journal.close();await f.close();}
});
