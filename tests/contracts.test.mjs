import test from 'node:test';import assert from 'node:assert/strict';import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex,encodeAbiParameters,parseAbiParameters} from 'viem';
import {compile} from '../scripts/compile-contracts.mjs';
test('EVM escrow and vault enforce authorization, caps, replay protection and refunds',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai'}});const transport=custom(provider);
 const publicClient=createPublicClient({transport});const wallet=createWalletClient({transport,chain:null});const [buyer,seller,forwarder,attacker,executor]=await wallet.getAddresses();const artifacts=compile();
 const deploy=async(name,args=[])=>{const hash=await wallet.deployContract({...artifacts[name],account:buyer,args,gas:6000000n});return(await publicClient.waitForTransactionReceipt({hash})).contractAddress;};
 const send=async(address,abi,functionName,args=[],account=buyer)=>{const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:1000000n});const receipt=await publicClient.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return receipt;};
 const metadata=stringToHex('registered-workflow-metadata');const wrongMetadata=stringToHex('different-workflow');const token=await deploy('MockToken');const escrow=await deploy('AgentEscrow',[token,forwarder,keccak256(metadata)]);const vault=await deploy('AgentVault',[escrow]);
 const tokenABI=artifacts.MockToken.abi,escrowABI=artifacts.AgentEscrow.abi,vaultABI=artifacts.AgentVault.abi;
 const balance=addr=>publicClient.readContract({address:token,abi:tokenABI,functionName:'balanceOf',args:[addr]});
 const id=n=>keccak256(stringToHex('task-'+n));const spec=keccak256(stringToHex('committed-spec')),out=keccak256(stringToHex('artifact'));
 const report=(n,accepted=true,specHash=spec)=>encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,bool'),[id(n),specHash,out,accepted]);
 const block=await publicClient.getBlock();const deadline=block.timestamp+3600n;
 try {
 await send(token,tokenABI,'mint',[buyer,10000n]);await send(token,tokenABI,'approve',[escrow,10000n]);
 await send(escrow,escrowABI,'openTask',[id(1),seller,240n,deadline,spec]);assert.equal(await balance(escrow),240n);
 await assert.rejects(send(escrow,escrowABI,'onReport',[metadata,report(1)],attacker));
 await assert.rejects(send(escrow,escrowABI,'onReport',[wrongMetadata,report(1)],forwarder));
 await assert.rejects(send(escrow,escrowABI,'onReport',[metadata,report(1,true,id(999))],forwarder));
 await send(escrow,escrowABI,'onReport',[metadata,report(1)],forwarder);assert.equal(await balance(seller),240n);
 await assert.rejects(send(escrow,escrowABI,'onReport',[metadata,report(1)],forwarder));assert.equal(await balance(seller),240n);
 await send(escrow,escrowABI,'openTask',[id(2),seller,300n,deadline,spec]);await send(escrow,escrowABI,'onReport',[metadata,report(2,false)],forwarder);assert.equal(await balance(buyer),9760n);
 await send(escrow,escrowABI,'openTask',[id(3),seller,400n,block.timestamp+30n,spec]);await assert.rejects(send(escrow,escrowABI,'refundExpired',[id(3)]));
 await provider.request({method:'evm_increaseTime',params:[31]});await provider.request({method:'evm_mine',params:[]});await send(escrow,escrowABI,'refundExpired',[id(3)],attacker);assert.equal(await balance(buyer),9760n);
 await send(token,tokenABI,'mint',[vault,2000n]);await send(vault,vaultABI,'grant',[executor,300n,500n,deadline]);await send(vault,vaultABI,'allowSeller',[seller,true]);
 await assert.rejects(send(vault,vaultABI,'execute',[id(4),seller,301n,deadline,spec],executor));
 await assert.rejects(send(vault,vaultABI,'execute',[id(4),attacker,240n,deadline,spec],executor));
 await send(vault,vaultABI,'execute',[id(4),seller,240n,deadline,spec],executor);await send(vault,vaultABI,'execute',[id(5),seller,240n,deadline,spec],executor);
 await assert.rejects(send(vault,vaultABI,'execute',[id(6),seller,240n,deadline,spec],executor));
 await send(vault,vaultABI,'revoke',[executor]);await assert.rejects(send(vault,vaultABI,'execute',[id(7),seller,1n,deadline,spec],executor));
 await assert.rejects(send(vault,vaultABI,'withdraw',[1n],attacker));
 await send(escrow,escrowABI,'onReport',[metadata,report(4,false)],forwarder);assert.equal(await balance(vault),1760n);
 } finally { await provider.disconnect(); }
});
