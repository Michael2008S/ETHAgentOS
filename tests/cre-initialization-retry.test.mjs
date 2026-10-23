import test from 'node:test';import assert from 'node:assert/strict';
import {retryCREInitialization,transientCREInitialization} from '../scripts/cre-initialization-retry.mjs';
const outage={code:1,output:'Credential validation failed: unable to retrieve organization info'};
test('CRE retries only a pre-execution organization lookup outage and retains attempts',async()=>{
 const waits=[],result=await retryCREInitialization(async attempt=>attempt<3?outage:{code:0,output:'Delivery consensus: accepted=true'},{wait:async ms=>waits.push(ms)});
 assert.equal(result.code,0);assert.equal(result.attempts.length,3);assert.deepEqual(waits,[2000,4000]);
});
test('CRE initialization retries stop at three and do not retry execution or credential errors',async()=>{
 const result=await retryCREInitialization(async()=>outage,{wait:async()=>{}});assert.equal(result.code,1);assert.equal(result.attempts.length,3);
 for(const output of ['authentication required: expired credentials','workflow verification failed',outage.output+'\nCRE report generated',outage.output+'\nDelivery consensus: accepted=false',outage.output+'\nWorkflow execution started']){
  assert.equal(transientCREInitialization({code:1,output}),false);
  assert.equal((await retryCREInitialization(async()=>({code:1,output}))).attempts.length,1);
 }
});
