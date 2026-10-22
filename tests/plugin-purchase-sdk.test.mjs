import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {AgentPluginPurchaseClient} from '../sdk/plugin-purchases.ts';import {purchaseFixture} from './plugin-purchase-fixture.mjs';import {createPluginPurchase} from '../lib/agentos/plugin-purchase-store.ts';import {publicPluginPurchase} from '../lib/agentos/plugin-purchase-protocol.ts';
test('paid plugin SDK is directly importable in Node strip-only mode without a hosted runtime',()=>{const child=spawnSync(process.execPath,['--input-type=module','-e',"const {AgentPluginPurchaseClient}=await import('./sdk/plugin-purchases.ts');if(new AgentPluginPurchaseClient('local').baseURL!=='local')throw Error('constructor');"],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);});
test('paid plugin SDK rejects foreign scope, leaked leases, changed terms and unresolved terminal escrows',async()=>{
 const f=await purchaseFixture(),original=globalThis.fetch;try{const flow=publicPluginPurchase(await createPluginPurchase(f.store,f.owner,f.draft(),f.context));let detail={scope:f.scope,flow,jobs:[]};globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/api/plugins')?{scope:f.scope,plugins:[f.installed],grants:[],jobs:[]}:detail),{headers:{'Content-Type':'application/json'}});const client=new AgentPluginPurchaseClient('http://127.0.0.1',{},f.scope);assert.equal((await client.inspect(flow.id)).flow.id,flow.id);
  detail={scope:'0x'+'0'.repeat(64),flow,jobs:[]};await assert.rejects(client.inspect(flow.id),/another workspace/);
  detail={scope:f.scope,flow:{...flow,runLease:{token:'must not leak',until:new Date().toISOString()}},jobs:[]};await assert.rejects(client.inspect(flow.id),/immutable terms/);
  detail={scope:f.scope,flow:structuredClone(flow),jobs:[]};detail.flow.steps[0].priceCents++;await assert.rejects(client.inspect(flow.id),/immutable terms/);
  detail={scope:f.scope,flow:{...flow,status:'completed'},jobs:[]};await assert.rejects(client.inspect(flow.id),/unresolved escrows/);
 }finally{globalThis.fetch=original;f.close();}
});
