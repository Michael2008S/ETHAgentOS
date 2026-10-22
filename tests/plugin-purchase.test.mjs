import {test} from 'node:test';import assert from 'node:assert/strict';
import {seed} from '../lib/agentos/engine.ts';
import {pluginPurchaseRequestSchema,normalizePluginPermissions,selectPluginPurchaseInput,pluginPurchaseReservations,pluginPurchaseTaskId} from '../lib/agentos/plugin-purchase-protocol.ts';
import {pluginVaultAllowance,vaultAllowance} from '../lib/agentos/vault.ts';
const hash=n=>'0x'+String(n).repeat(64),address=n=>'0x'+String(n).repeat(40),now='2026-10-22T08:00:00.000Z';
const permission={pluginId:'plugin:text-inventory@1.0.0',manifestHash:hash(1),runtimeHash:hash(2),maxPriceCents:100};
const buyer=address(1),sessionId='00000000-0000-4000-8000-000000000001';
const session=()=>({sessionId,owner:buyer,skills:['event-analysis'],pluginPermissions:[permission],signature:'0x1234',expires:String(Date.parse('2026-10-23T08:00:00Z')/1000),perTaskCents:200,totalCents:500});
const draft=()=>({requestId:crypto.randomUUID(),title:'Generic labels',buyer,vaultSessionId:sessionId,input:{labels:['A','a']},steps:[{...permission,input:{from:'root'}},{...permission,input:{from:'step',step:0}}],totalBudget:200});
test('paid plugin drafts reject hidden parameters, forward references, unsafe paths and over-budget programs',async()=>{
 const parsed=pluginPurchaseRequestSchema.parse(draft());assert.deepEqual(parsed.steps[0].input,{from:'root',path:[]});
 assert.equal(pluginPurchaseRequestSchema.safeParse({...draft(),url:'https://attacker.invalid'}).success,false);
 const forward=draft();forward.steps[0].input={from:'step',step:1};assert.equal(pluginPurchaseRequestSchema.safeParse(forward).success,false);
 const path=draft();path.steps[1].input.path=['constructor'];assert.equal(pluginPurchaseRequestSchema.safeParse(path).success,false);
 assert.equal(pluginPurchaseRequestSchema.safeParse({...draft(),totalBudget:199}).success,false);
 assert.throws(()=>normalizePluginPermissions([permission,permission]),/unique/);
 assert.notEqual(await pluginPurchaseTaskId(hash(1),parsed.requestId,0),await pluginPurchaseTaskId(hash(2),parsed.requestId,0));
});
test('existing Vault sessions do not gain plugin authority; exact code/runtime/price and monetary limits are required',()=>{
 const state=seed();state.vaultSessions=[session()];assert.equal(pluginVaultAllowance(state,sessionId,buyer,permission,100,200,now).sessionId,sessionId);
 const original=structuredClone(state);delete state.vaultSessions[0].pluginPermissions;assert.throws(()=>pluginVaultAllowance(state,sessionId,buyer,permission,100,100,now),/does not authorize/);
 for(const altered of [{...permission,manifestHash:hash(3)},{...permission,runtimeHash:hash(3)},{...permission,maxPriceCents:101}])assert.throws(()=>pluginVaultAllowance(original,sessionId,buyer,altered,100,100,now),/does not authorize/);
 assert.throws(()=>pluginVaultAllowance(original,sessionId,address(2),permission,100,100,now),/active Vault/);
 assert.throws(()=>pluginVaultAllowance(original,sessionId,buyer,permission,201,100,now),/active Vault/);
 assert.throws(()=>pluginVaultAllowance(original,sessionId,buyer,permission,100,501,now),/total allowance/);
});
test('plugin reservations share existing session accounting and refunded gross fees cannot be spent again',()=>{
 const state=seed();state.vaultSessions=[session()];state.pluginPurchases=[{id:'purchase',vaultSessionId:sessionId,deployment:{chainId:31337,token:address(3)},status:'running',deadlineAt:now,steps:[{priceCents:100,status:'refunded',funded:true,settledAt:now},{priceCents:100,status:'pending',funded:false}]}];
 assert.equal(vaultAllowance(state,sessionId,buyer,'event-analysis',100,300,now).sessionId,sessionId);assert.throws(()=>vaultAllowance(state,sessionId,buyer,'event-analysis',100,301,now),/total allowance/);
 assert.equal(pluginPurchaseReservations(state,now).reduce((n,r)=>n+r.quote,0),200);
 state.pluginPurchases[0].steps[1].status='cancelled';assert.equal(pluginPurchaseReservations(state,now).reduce((n,r)=>n+r.quote,0),100);
 const tomorrow=pluginPurchaseReservations(state,'2026-10-23T08:00:00.000Z');assert.equal(tomorrow[0].budget,0);assert.equal(tomorrow[0].quote,100);
 state.pluginPurchases[0].steps[1].funded=true;assert.equal(pluginPurchaseReservations(state,now)[1].budget,100,'a cancelled funding intent cannot release a potentially broadcast principal');
});
test('generic JSON dependencies are copied only from supplied verified paid parents',()=>{
 const root={labels:['A','a']},output={labels:['a'],count:1};const refs=new Map([[0,output]]);
 assert.deepEqual(selectPluginPurchaseInput(root,{from:'step',step:0,path:['labels']},refs),['a']);assert.throws(()=>selectPluginPurchaseInput(root,{from:'step',step:1,path:[]},refs),/paid parent/);
 const selected=selectPluginPurchaseInput(root,{from:'root',path:[]},refs);selected.labels.push('changed');assert.equal(root.labels.length,2);
});
