import test from 'node:test';
import assert from 'node:assert/strict';
import {browserRuntime} from '../scripts/browser-runtime.mjs';
const profile={identityEnabled:true,baseURL:'http://127.0.0.1:5787',chainURL:'http://127.0.0.1:9155',supplierURL:'http://127.0.0.1:8071',supplier2URL:'http://127.0.0.1:8072'};
test('explicit browser profiles target one retained identity runtime and preserve test filters',async()=>{
 const r=await browserRuntime(['--runtime','owned.json','--grep','goal-driven'],async path=>{assert.equal(path,'owned.json');return JSON.stringify(profile);});assert.deepEqual(r.args,['--grep','goal-driven']);assert.equal(r.environment.AGENTOS_TEST_URL,profile.baseURL);assert.equal(r.environment.AGENTOS_CHAIN_URL,profile.chainURL);assert.equal(r.environment.AGENTOS_SECOND_SUPPLIER_URL,profile.supplier2URL);assert.deepEqual(await browserRuntime(['--grep','draft']),{args:['--grep','draft'],environment:{}});
});
test('browser profiles refuse remote endpoints, credentials, malformed flags and identity-disabled fixtures',async()=>{
 for(const patch of [{identityEnabled:false},{baseURL:'https://example.com'},{chainURL:'http://secret@127.0.0.1:9155'},{supplierURL:'http://127.0.0.1:8071/path'},{supplier2URL:'http://example.com:8072'}])await assert.rejects(browserRuntime(['--runtime','owned.json'],async()=>JSON.stringify({...profile,...patch})));for(const args of [['--runtime'],['--runtime','--grep'],['--runtime','a','--runtime','b']])await assert.rejects(browserRuntime(args,async()=>JSON.stringify(profile)));
});
