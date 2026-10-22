import {test} from 'node:test';import assert from 'node:assert/strict';
import ganache from 'ganache';import {createPublicClient,createWalletClient,custom,keccak256,stringToHex} from 'viem';import {privateKeyToAccount} from 'viem/accounts';
import {compile} from '../scripts/compile-contracts.mjs';import {seed} from '../lib/agentos/engine.ts';
import {prepareVaultSession,pluginVaultAllowance,checkVaultBinding,vaultABI,sessionBinding} from '../lib/agentos/vault.ts';
import {canonical} from '../cre/workflow/verify.ts';
test('a real Vault owner signature commits exact plugin capabilities and cannot be reused with changed manifest, runtime or price',async()=>{
 const provider=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4},chain:{chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0,pollingInterval:5}),wallet=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller,forwarder,executor]=await wallet.getAddresses(),contracts=compile();
 const deploy=async(name,args=[])=>{const r=await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],args,account:buyer,gas:6000000n})});assert.equal(r.status,'success');return r.contractAddress;};
 const write=async(address,abi,functionName,args)=>{const r=await client.waitForTransactionReceipt({hash:await wallet.writeContract({address,abi,functionName,args,account:buyer,gas:6000000n})});assert.equal(r.status,'success');};
 try{
  const token=await deploy('MockToken'),escrow=await deploy('AgentEscrow',[token,forwarder,keccak256(stringToHex('plugin-grant-test'))]),vault=await deploy('AgentVault',[escrow]),deployment={mode:'local',chainId:31337,token,escrow,forwarder,metadataHash:keccak256(stringToHex('plugin-grant-test')),confirmations:1,seller,vault,vaultExecutor:executor,deployedBlock:'0'};
  await write(vault,vaultABI,'allowSeller',[seller,true]);const expires=(await client.getBlock()).timestamp+3600n;await write(vault,vaultABI,'grant',[executor,2000000n,5000000n,expires]);
  const state=seed(),permission={pluginId:'plugin:text-inventory@1.0.0',manifestHash:'0x'+'1'.repeat(64),runtimeHash:'0x'+'2'.repeat(64),maxPriceCents:100};
  const session=await prepareVaultSession(state,'plugin-owner',deployment,client,{buyer,perTaskCents:200,totalCents:500,pluginPermissions:[permission]},crypto.randomUUID());
  const account=privateKeyToAccount(provider.getInitialAccounts()[buyer.toLowerCase()].secretKey);session.signature=await account.signMessage({message:session.message});assert.equal(await client.verifyMessage({address:buyer,message:session.message,signature:session.signature}),true);
  assert.ok(session.message.includes('Grant: '+canonical(sessionBinding(session))));state.vaultSessions=[session];assert.equal(pluginVaultAllowance(state,session.sessionId,buyer,permission,100,200).sessionId,session.sessionId);await checkVaultBinding(client,deployment,session);
  for(const key of ['manifestHash','runtimeHash','maxPriceCents']){const changed=structuredClone(session),p=changed.pluginPermissions[0];p[key]=key==='maxPriceCents'?101:'0x'+'3'.repeat(64);const message=changed.message.replace('Grant: '+canonical(sessionBinding(session)),'Grant: '+canonical(sessionBinding(changed)));assert.equal(await client.verifyMessage({address:buyer,message,signature:session.signature}),false);assert.throws(()=>pluginVaultAllowance(state,session.sessionId,buyer,p,100,100),/does not authorize/);}
  const legacy=await prepareVaultSession(state,'plugin-owner',deployment,client,{buyer,perTaskCents:200,totalCents:500},crypto.randomUUID());legacy.signature=await account.signMessage({message:legacy.message});state.vaultSessions=[legacy];assert.equal(legacy.pluginPermissions,undefined);assert.throws(()=>pluginVaultAllowance(state,legacy.sessionId,buyer,permission,100,100),/does not authorize/);
  await write(vault,vaultABI,'revoke',[executor]);await assert.rejects(checkVaultBinding(client,deployment,session),/revoked/);
 }finally{await provider.disconnect();}
});
