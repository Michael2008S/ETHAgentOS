import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryVerification } from '../cre/workflow/verify.ts';
import { parseConfig, validateConfig } from '../cre/workflow/config.ts';
const config={schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:'0x'+'a'.repeat(40),taskId:'0x'+'b'.repeat(64),gasLimit:'500000',spec:{datasetUrl:'https://evidence.example/data.json',datasetHash:'0x'+'c'.repeat(64),artifactUrl:'https://artifact.example/result.json',verification:deliveryVerification('event-analysis',{dataset:'custom-transfers-v1',blockFrom:0,blockTo:10})}};
test('CRE config parses actual values and rejects placeholders before network operations',()=>{
  assert.deepEqual(parseConfig(new TextEncoder().encode(JSON.stringify(config))),config);
  for(const patch of [{escrowAddress:'REPLACE_WITH_DEPLOYED_ESCROW_ADDRESS'},{taskId:'0x'+'0'.repeat(64)},{gasLimit:'-1'},{gasLimit:'999999999999999999999'},{gasLimit:'1.5'},{schedule:'invalid'},{spec:{...config.spec,datasetUrl:'http://evidence.example/data.json'}},{spec:{...config.spec,artifactUrl:'https://secret:password@artifact.example/result.json'}},{spec:{...config.spec,datasetHash:'unknown'}},{spec:{...config.spec,verification:undefined}},{spec:{...config.spec,verification:{...config.spec.verification,skillVersion:'2.0.0'}}}])assert.throws(()=>validateConfig({...config,...patch}));
});
