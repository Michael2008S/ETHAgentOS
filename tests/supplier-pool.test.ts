import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSupplierConfigurations,supplierPool,supplierForOrder,parseSupplierKeys,readSupplierJSON} from '../lib/agentos/supplier-pool.ts';
import {purchaseChoices} from '../lib/agentos/purchase-plan.ts';
import {normalizedVaultSellers,assertVaultSeller} from '../lib/agentos/vault.ts';
import {seed} from '../lib/agentos/engine.ts';
import type {OrderSupplier,SupplierDescriptor,SupplierRequest} from '../lib/agentos/supplier.ts';
import type {ChainOrder} from '../lib/agentos/orders.ts';
const signer='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const config=(id:string)=>({id,name:id,url:'https://'+id+'.example/v1/execute',revision:'1.0.0',signer,skills:['event-analysis'],timeoutMs:1000});
function fake(id:string,hash:string){const calls={execute:0,authorize:0};const descriptor={id,name:id,revision:'1.0.0',signer,skills:['event-analysis'],configHash:hash} as SupplierDescriptor;return {calls,descriptor,authorize:async()=>{calls.authorize++;},execute:async()=>{calls.execute++;throw new Error('provider '+id+' offline');}} satisfies OrderSupplier&{calls:typeof calls};}

test('supplier pool rejects duplicate identities, unbounded catalogs and endpoint injection',()=>{
 assert.equal(parseSupplierConfigurations([config('first'),config('second')]).length,2);
 for(const value of [[],Array.from({length:9},(_,i)=>config('s'+i)),[config('first'),config('first')],[{...config('first'),url:'http://127.0.0.1/v1/execute'}],[{...config('first'),url:'https://user:secret@first.example/v1/execute'}],[{...config('first'),url:'https://first.example/v1/execute?redirect=1'}],[{...config('first'),apiKey:'must-not-enter-descriptors'}]])assert.throws(()=>parseSupplierConfigurations(value));
 assert.equal(parseSupplierConfigurations([{...config('first'),url:'http://127.0.0.1:7771/v1/execute'}],true).length,1);
});
test('a frozen second-provider order routes only to its exact descriptor and never falls back after an outage or configuration mismatch',async()=>{
 const first=fake('first','0x'+'11'.repeat(32)),second=fake('second','0x'+'22'.repeat(32)),pool=supplierPool([first,second]),order={supplier:second.descriptor} as ChainOrder;
 assert.equal(pool.selectById(),first);assert.equal(pool.selectById('second'),second);assert.equal(supplierForOrder(pool,second.descriptor),second);
 await pool.authorize(order);await assert.rejects(pool.execute({supplier:second.descriptor} as SupplierRequest),/provider second offline/);assert.deepEqual(first.calls,{execute:0,authorize:0});assert.deepEqual(second.calls,{execute:1,authorize:1});
 assert.throws(()=>supplierForOrder(pool,{...second.descriptor,configHash:first.descriptor.configHash}),/differs/);assert.throws(()=>pool.selectById('https://attacker.example'),/not configured/);assert.throws(()=>supplierForOrder(first,second.descriptor),/differs/);assert.throws(()=>supplierForOrder(undefined,second.descriptor),/unavailable/);
 const reordered=supplierPool([second,first]);assert.equal(supplierForOrder(reordered,first.descriptor),first);assert.throws(()=>supplierPool([first,first]),/unique/);
});
test('purchase comparisons retain the exact authorized supplier and never invent provider access',()=>{
 const state=seed(),first=fake('first','0x'+'11'.repeat(32)),second=fake('second','0x'+'22'.repeat(32)),allowed=new Map([['atlas',[first.descriptor,second.descriptor]]]),choices=purchaseChoices(state,1000,allowed),external=choices.filter(c=>c.executor==='supplier');
 assert.deepEqual(external.map(c=>c.supplierId),['first','second']);assert.equal(new Set(choices.map(c=>c.id)).size,choices.length);assert.ok(external.every(c=>c.agentId==='atlas'&&c.supplierConfigHash));assert.ok(!choices.some(c=>c.agentId==='sage'&&c.executor==='supplier'));
 state.policy.active=false;assert.equal(purchaseChoices(state,1000,allowed).length,0);
});
test('additional Vault payees are normalized and require inclusion in the immutable signed set',()=>{
 const sellers=normalizedVaultSellers(signer,[other]);assert.deepEqual(sellers,[signer,other]);assert.deepEqual(normalizedVaultSellers(signer),[signer]);
 assert.throws(()=>normalizedVaultSellers(signer,[other,other]),/unique/);assert.throws(()=>normalizedVaultSellers(signer,[('0x'+'00'.repeat(20)) as `0x${string}`]),/nonzero/);assert.throws(()=>normalizedVaultSellers(signer,Array.from({length:8},(_,i)=>('0x'+(i+3).toString(16).padStart(40,'0')) as `0x${string}`)),/eight/);
 assert.throws(()=>assertVaultSeller({seller:signer},other),/does not permit/);assert.doesNotThrow(()=>assertVaultSeller({seller:signer,sellers},other));
});

test('provider authentication stays private, handles prototype-like identifiers and refuses unknown or malformed keys',()=>{
 const configurations=parseSupplierConfigurations([config('constructor'),config('second')]);assert.equal(parseSupplierKeys(undefined,configurations).get('constructor'),undefined);assert.equal(parseSupplierKeys(JSON.parse('{"constructor":"synthetic-provider-secret"}'),configurations).get('constructor'),'synthetic-provider-secret');
 for(const value of [null,[],{'unknown':'secret'},{second:''},{second:123},{second:'x'.repeat(4097)}])assert.throws(()=>parseSupplierKeys(value,configurations),/invalid configuration/);
 assert.ok(!JSON.stringify(configurations).includes('synthetic-provider-secret'));
});
test('catalog response reads are bounded and malformed or unavailable endpoints cannot become configurations',async()=>{
 assert.deepEqual(await readSupplierJSON(Response.json([config('first')])),[config('first')]);await assert.rejects(readSupplierJSON(new Response('x'.repeat(65537))),/size limit/);await assert.rejects(readSupplierJSON(new Response('<html>provider error</html>')),/unavailable/);await assert.rejects(readSupplierJSON(new Response('{}',{status:503})),/unavailable/);
});
