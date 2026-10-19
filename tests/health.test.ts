import test from 'node:test';import assert from 'node:assert/strict';import { consumerState } from '../lib/agentos/health.ts';
test('consumer status distinguishes missing, active, slow busy, stale and failed consumers',()=>{
 const now=200000;assert.equal(consumerState(null,now),'unavailable');assert.equal(consumerState({last_seen:now,status:'ready'},now),'healthy');assert.equal(consumerState({last_seen:now-60000,status:'busy'},now),'busy');assert.equal(consumerState({last_seen:now-16000,status:'ready'},now),'stale');assert.equal(consumerState({last_seen:now,status:'failed'},now),'stale');assert.equal(consumerState({last_seen:now-120001,status:'busy'},now),'stale');
});
