import test from 'node:test';import assert from 'node:assert/strict';
import {seed} from '../lib/agentos/engine.ts';import {createOrder,claimVaultFunding,findOrder,type OrderDraft} from '../lib/agentos/orders.ts';import {vaultAllowance,type VaultSession} from '../lib/agentos/vault.ts';import {inputEvidence,type WalletDeployment} from '../sdk/wallet.ts';
const owner='0x1111111111111111111111111111111111111111',vault='0x2222222222222222222222222222222222222222',executor='0x3333333333333333333333333333333333333333',hash=('0x'+'a'.repeat(64)) as `0x${string}`,now='2026-10-21T08:00:00.000Z';
const deployment:WalletDeployment={mode:'local',chainId:31337,token:owner,escrow:owner,forwarder:owner,metadataHash:hash,confirmations:1,seller:owner,vault,vaultExecutor:executor,deployedBlock:'0'};
function fixture(){const state=seed(now),session:VaultSession={sessionId:crypto.randomUUID(),chainId:31337,escrow:owner,token:owner,seller:owner,vault,executor,owner,epoch:'1',perTaskCents:300,totalCents:720,dailyCents:1000,expires:String(Date.parse(now)/1000+3600),skills:['event-analysis'],scope:'workspace',message:'verified by API before persistence',challengeExpiresAt:now,signature:('0x'+'1'.repeat(130)) as `0x${string}`};state.vaultSessions=[session];return {state,session};}
test('session authority rejects wrong buyer, skill, budget, expiry and revocation before reserving a quote',()=>{
 const {state,session}=fixture();assert.equal(vaultAllowance(state,session.sessionId,owner,'event-analysis',300,240,now).sessionId,session.sessionId);
 for(const [buyer,skill,budget] of [[vault,'event-analysis',300],[owner,'treasury-report',300],[owner,'event-analysis',301]] as const)assert.throws(()=>vaultAllowance(state,session.sessionId,buyer,skill,budget,240,now),/authorizes/);
 assert.throws(()=>vaultAllowance(state,session.sessionId,owner,'event-analysis',300,240,'2026-10-22T08:00:00.000Z'),/authorizes/);session.revokedAt=now;assert.throws(()=>vaultAllowance(state,session.sessionId,owner,'event-analysis',300,240,now),/authorizes/);
});
test('unfunded quotes reserve total capacity atomically, cancelling an unsent draft releases it, funding leases fence duplicate consumers',async()=>{
 let {state,session}=fixture();
 const create=async()=>{const requestId=crypto.randomUUID(),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'a',to:'b',cents:123}]},bytes=inputEvidence({id:'chain-'+requestId,input,skill:'event-analysis'},owner),spec={datasetUrl:'https://a.example',artifactUrl:'https://b.example',datasetHash:bytes.datasetHash,verification:bytes.verification};state=await createOrder(state,{requestId,vaultSessionId:session.sessionId,buyer:owner,agentId:'atlas',title:'Reserve quote',budget:300,input,spec,scenario:'success',timeoutSeconds:300},deployment,now);return state.chainOrders![0];};
 const first=await create();await create();await create();await assert.rejects(create(),/total allowance/);findOrder(state,first.id).status='cancelled';const replacement=await create();
 const deadline=BigInt(Date.parse(now)/1000+300),leased=claimVaultFunding(state,replacement.id,'first',deadline,now);assert.equal(findOrder(leased,replacement.id).vaultFunding!.token,'first');assert.equal(claimVaultFunding(leased,replacement.id,'second',deadline,now),leased);
 leased.vaultSessions![0].revokedAt=now;const recovered=claimVaultFunding(leased,replacement.id,'receipt-recovery',deadline+100n,now,true);assert.equal(findOrder(recovered,replacement.id).vaultFunding!.deadline,deadline.toString());assert.equal(findOrder(recovered,replacement.id).vaultFunding!.token,'receipt-recovery');
});
test('automatic Vault drafts reserve the workspace daily budget before any chain transfer',async()=>{
 let {state,session}=fixture();state.policy.dailyBudget=300;
 const input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:1,records:[{block:1,from:'a',to:'b',cents:1}]};
 const draft=():OrderDraft=>{const requestId=crypto.randomUUID(),bytes=inputEvidence({id:'chain-'+requestId,input,skill:'event-analysis'},owner);return {requestId,vaultSessionId:session.sessionId,buyer:owner,agentId:'atlas',title:'Daily reservation',budget:300,input,spec:{datasetUrl:'https://a.example',artifactUrl:'https://b.example',datasetHash:bytes.datasetHash,verification:bytes.verification},scenario:'success',timeoutSeconds:300};};
 state=await createOrder(state,draft(),deployment,now);assert.equal(state.chainOrders![0].status,'funding');assert.equal(state.chainOrders![0].funding,null);
 await assert.rejects(createOrder(state,draft(),deployment,now),/daily allowance/);
});
