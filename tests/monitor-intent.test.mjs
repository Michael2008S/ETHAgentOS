import test from 'node:test';import assert from 'node:assert/strict';
import {saveMonitorIntent,loadMonitorIntent,clearMonitorIntent} from '../sdk/monitor-intent.ts';
test('refreshed monitor retains exact request and renewal; scope, buyer and deployment changes cannot adopt it',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},deployment={mode:'local',chainId:31337},scope='0x'+'a'.repeat(64),buyer='0x'+'1'.repeat(40);
 const draft={requestId:crypto.randomUUID(),title:'Monitor',buyer,vaultSessionId:crypto.randomUUID(),account:buyer,startBlock:100,windowBlocks:1,pollSeconds:5,thresholdBps:5000,maxReports:1,totalBudget:460,perReportBudget:460,durationSeconds:600,services:[{id:'skill',digest:scope},{id:'plugin',digest:scope}],renewal:{sourceId:'usdc-monitor-'+crypto.randomUUID(),snapshotHash:scope}};
 saveMonitorIntent(storage,scope,deployment,draft);assert.deepEqual(loadMonitorIntent(storage,scope,deployment,buyer),draft);assert.equal(loadMonitorIntent(storage,'other',deployment,buyer),undefined);assert.equal(loadMonitorIntent(storage,scope,{...deployment,chainId:2},buyer),undefined);assert.equal(loadMonitorIntent(storage,scope,deployment,'0x'+'2'.repeat(40)),undefined);clearMonitorIntent(storage,scope);assert.equal(loadMonitorIntent(storage,scope,deployment,buyer),undefined);
});
