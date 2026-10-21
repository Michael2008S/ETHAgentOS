import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,encodePacked,keccak256,stringToHex,sha256,toFunctionSelector} from 'viem';
import {compile} from '../scripts/compile-contracts.mjs';
import {AgentChainClient,escrowABI,encodeSettlementReport} from '../sdk/chain.ts';
import {creWorkflowName,creIdentityHash,verifyCREReceiver,bindCREWorkflowTransaction,validateReceiverIdentity} from '../sdk/cre-receiver.ts';
import {vaultEscrowWindow} from '../lib/agentos/orders.ts';

test('CRE workflow names follow the engine ASCII-hex encoding and identity descriptors reject missing pins',()=>{
 assert.equal(creWorkflowName('my_workflow'),'0x62373666336165316465');
 assert.notEqual(creWorkflowName('my_workflow'),sha256(stringToHex('my_workflow')).slice(0,22));
 for(const name of ['','name with spaces','x'.repeat(65)])assert.throws(()=>creWorkflowName(name));
 const identity={format:'cre-v1',workflowId:'0x'+'11'.repeat(32),workflowName:creWorkflowName('agentos-public'),workflowOwner:'0x'+'22'.repeat(20)};
 validateReceiverIdentity(identity);
 for(const field of ['workflowId','workflowName','workflowOwner'])assert.throws(()=>validateReceiverIdentity({...identity,[field]:'0x'+'00'.repeat(field==='workflowId'?32:field==='workflowName'?10:20)}));
 assert.throws(()=>bindCREWorkflowTransaction(identity.workflowOwner,'0x'+'00'.repeat(32)));
 assert.equal(vaultEscrowWindow({deployment:{mode:'testnet'},timeoutSeconds:300}),3600,'public escrow must not expire with the five-minute execution budget before finalized CRE reads');
 assert.equal(vaultEscrowWindow({deployment:{mode:'testnet'},timeoutSeconds:7200}),7200);
 assert.equal(vaultEscrowWindow({deployment:{mode:'local'},timeoutSeconds:300}),300);
});

test('CRE-compatible receiver pins identity once, supports ERC165 and accepts varying report IDs without weakening task settlement',async()=>{
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}}),client=createPublicClient({transport:custom(provider),cacheTime:0}),wallet=createWalletClient({transport:custom(provider),chain:null}),[buyer,seller,workflowOwner,attacker]=await wallet.getAddresses(),contracts=compile();
 const tx=async(address,abi,functionName,args=[],account=buyer)=>{const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});return client.waitForTransactionReceipt({hash});};
 const success=async(...args)=>{const receipt=await tx(...args);assert.equal(receipt.status,'success');return receipt;};
 const denied=async(...args)=>assert.equal((await tx(...args)).status,'reverted');
 const deploy=async(name,args=[])=>(await client.waitForTransactionReceipt({hash:await wallet.deployContract({...contracts[name],args,account:buyer,gas:6000000n})})).contractAddress;
 try{
  const token=await deploy('MockToken'),forwarder=await deploy('MockCREForwarder'),workflowName=creWorkflowName('agentos-public'),workflowId=keccak256(stringToHex('registered-workflow-id')),escrow=await deploy('AgentEscrowReceiver',[token,forwarder,workflowOwner,workflowName]),abi=contracts.AgentEscrowReceiver.abi,identity={format:'cre-v1',workflowId,workflowName,workflowOwner},deployment={chainId:31337,token,forwarder,escrow,metadataHash:creIdentityHash(workflowName,workflowOwner),receiver:identity,confirmations:1},adapter=new AgentChainClient(client,deployment);
  assert.equal(toFunctionSelector('onReport(bytes,bytes)'),'0x805f2132');
  assert.equal(await client.readContract({address:escrow,abi,functionName:'supportsInterface',args:['0x805f2132']}),true);assert.equal(await client.readContract({address:escrow,abi,functionName:'supportsInterface',args:['0x01ffc9a7']}),true);assert.equal(await client.readContract({address:escrow,abi,functionName:'supportsInterface',args:['0xffffffff']}),false);
  const id=n=>keccak256(stringToHex('cre-receiver-task-'+n)),spec=keccak256(stringToHex('spec')),output=keccak256(stringToHex('full-artifact')),deadline=(await client.getBlock()).timestamp+3600n;
  await success(token,contracts.MockToken.abi,'mint',[buyer,10000n]);await success(token,contracts.MockToken.abi,'approve',[escrow,10000n]);
  await denied(escrow,abi,'openTask',[id(1),seller,240n,deadline,spec]);await assert.rejects(adapter.validateDeployment(),/unbound/);
  await denied(escrow,abi,'bindWorkflow',[workflowId],attacker);await denied(escrow,abi,'bindWorkflow',['0x'+'00'.repeat(32)]);
  const binding=bindCREWorkflowTransaction(escrow,workflowId),bound=await wallet.sendTransaction({...binding,account:buyer,gas:6000000n});assert.equal((await client.waitForTransactionReceipt({hash:bound})).status,'success');
  await denied(escrow,abi,'bindWorkflow',[workflowId]);await denied(escrow,abi,'bindWorkflow',[spec]);
  await adapter.validateDeployment();await assert.rejects(verifyCREReceiver(client,escrow,{...identity,workflowId:spec}),/differs/);
  const metadata=(overrides={})=>encodePacked(['bytes32','bytes10','address','bytes2'],[overrides.id??workflowId,overrides.name??workflowName,overrides.owner??workflowOwner,overrides.reportId??'0x0000']);
  await success(escrow,abi,'openTask',[id(1),seller,240n,deadline,spec]);const payload=encodeSettlementReport(id(1),spec,output,true);
  await denied(escrow,abi,'onReport',[metadata(),payload],attacker);
  for(const bad of [metadata({id:spec}),metadata({name:creWorkflowName('other-workflow')}),metadata({owner:attacker}),metadata().slice(0,-4),metadata()+'00'])await denied(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,bad,payload]);
  const paid=await success(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata({reportId:'0x1234'}),payload]);assert.equal((await client.readContract({address:escrow,abi:escrowABI,functionName:'tasks',args:[id(1)]}))[5],2);
  await denied(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata({reportId:'0xffff'}),payload]);
  const intent={id:id(1),buyer,seller,amount:240n,deadline,specHash:spec};assert.equal((await adapter.verifyEvidence(intent,paid.transactionHash,'settlement',output)).status,'paid');
  await success(escrow,abi,'openTask',[id(2),seller,300n,deadline,spec]);await success(forwarder,contracts.MockCREForwarder.abi,'deliver',[escrow,metadata({reportId:'0xabcd'}),encodeSettlementReport(id(2),spec,output,false)]);
  await success(escrow,abi,'openTask',[id(3),seller,400n,(await client.getBlock()).timestamp+2n,spec]);await provider.request({method:'evm_increaseTime',params:[3]});await provider.request({method:'evm_mine',params:[]});await success(escrow,abi,'refundExpired',[id(3)],attacker);
  assert.equal(await client.readContract({address:token,abi:contracts.MockToken.abi,functionName:'balanceOf',args:[buyer]}),9760n);assert.equal(await client.readContract({address:token,abi:contracts.MockToken.abi,functionName:'balanceOf',args:[seller]}),240n);
 }finally{await provider.disconnect();}
});
