import type { USDCMonitor } from '../lib/agentos/usdc-monitor-state.ts';
import test from 'node:test';import assert from 'node:assert/strict';import { consumerState,monitorSourceState } from '../lib/agentos/health.ts';
test('consumer status distinguishes missing, active, slow busy, stale and failed consumers',()=>{
 const now=200000;assert.equal(consumerState(null,now),'unavailable');assert.equal(consumerState({last_seen:now,status:'ready'},now),'healthy');assert.equal(consumerState({last_seen:now-60000,status:'busy'},now),'busy');assert.equal(consumerState({last_seen:now-16000,status:'ready'},now),'stale');assert.equal(consumerState({last_seen:now,status:'failed'},now),'unavailable');assert.equal(consumerState({last_seen:now-120001,status:'busy'},now),'stale');
 assert.equal(consumerState({last_seen:now-60000,status:'ready',interval_ms:60000},now),'healthy');assert.equal(consumerState({last_seen:now-180001,status:'ready',interval_ms:60000},now),'stale');assert.equal(consumerState({last_seen:now-16000,status:'ready',interval_ms:1e9},now),'stale');assert.equal(consumerState({last_seen:now+1000,status:'ready'},now),'stale');
});

test('source health distinguishes quiet successful scans, stale scans and stalled finality',()=>{
 const now=Date.now(),m={status:'running',draft:{pollSeconds:30},lastSuccessfulScanAt:new Date(now).toISOString(),finalizedAdvancedAt:new Date(now-600000).toISOString(),sourceFailures:0} as USDCMonitor;
 assert.equal(monitorSourceState([m],now),'healthy');m.lastSuccessfulScanAt=new Date(now-120001).toISOString();assert.equal(monitorSourceState([m],now),'stale');m.lastSuccessfulScanAt=new Date(now).toISOString();m.finalizedAdvancedAt=new Date(now-1200001).toISOString();assert.equal(monitorSourceState([m],now),'stale');m.sourceFailures=1;assert.equal(monitorSourceState([m],now),'unavailable');m.status='paused';assert.equal(monitorSourceState([m],now),'unchecked');
});
