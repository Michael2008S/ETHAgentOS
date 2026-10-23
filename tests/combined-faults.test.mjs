import test from 'node:test';import assert from 'node:assert/strict';import{runCombinedAcceptance}from'../scripts/ccip/combined-acceptance.mjs';
test('same workspace retains independent reservations during concurrent CCIP, Feed and unknown x402 faults',async()=>{const report=await runCombinedAcceptance();assert.equal(report.passed,true);assert.equal(report.checks.length,6);});
