import test from 'node:test';import assert from 'node:assert/strict';
import {keccak256,stringToHex,decodeFunctionData} from 'viem';
import {verifyDelivery,specHash} from '../cre/workflow/verify.ts';
import {registrationTransaction,identityABI} from '../sdk/identity.ts';
test('delivery verifier binds exact evidence bytes, task identity and computed output',()=>{
 const input=JSON.stringify([{cents:100},{cents:200}]),hash=keccak256(stringToHex(input)),id=keccak256(stringToHex('test'));
 const artifact={taskId:id,totalCents:300,transferCount:2};assert.equal(verifyDelivery(input,JSON.stringify(artifact),id,hash).accepted,true);
 assert.equal(verifyDelivery(input,JSON.stringify({...artifact,totalCents:301}),id,hash).accepted,false);
 assert.equal(verifyDelivery(input,JSON.stringify({...artifact,taskId:'other'}),id,hash).accepted,false);
 assert.throws(()=>verifyDelivery(input+' ',JSON.stringify(artifact),id,hash),/commitment/);
 const spec={datasetUrl:'https://evidence.example/a',datasetHash:hash,artifactUrl:'https://artifact.example/a'};assert.notEqual(specHash(spec),specHash({...spec,artifactUrl:'https://artifact.example/b'}));
});
test('registration adapter creates real ERC-8004 register calldata',()=>{
 const tx=registrationTransaction('0x1111111111111111111111111111111111111111','ipfs://agent-registration');const call=decodeFunctionData({abi:identityABI,data:tx.data});assert.equal(call.functionName,'register');assert.deepEqual(call.args,['ipfs://agent-registration']);
});
