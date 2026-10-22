import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import solc from 'solc';
import {createPublicClient,http,encodeDeployData,parseAbi,keccak256,stringToHex} from 'viem';
import {compile} from '../compile-contracts.mjs';
import {creWorkflowName,creIdentityHash} from '../../sdk/cre-receiver.ts';
/** This verifier never signs or submits a transaction. Funding rejection uses eth_call only. */
const directory=resolve(process.argv[2]||'outputs/erc8004-sepolia-2026-10-23');
const plan=JSON.parse(await readFile(directory+'/deployment-plan.json','utf8')),records=JSON.parse(await readFile(directory+'/transactions.json','utf8'));
const client=createPublicClient({transport:http('https://ethereum-sepolia-rpc.publicnode.com',{timeout:20000,retryCount:1})});
assert.equal(plan.chainId,11155111);assert.equal(await client.getChainId(),11155111);assert.equal(plan.workflowBindingEnabled,false);assert.equal(plan.fundingEnabled,false);
const artifacts=compile(),verified=[];
for(const kind of ['test-token','receiver']){
 const candidates=records.filter(r=>r.kind===kind);assert.ok(candidates.length,`缺少 ${kind} 部署记录，请先完成对应 MetaMask 操作。`);
 const successful=[];for(const record of candidates){const receipt=await client.getTransactionReceipt({hash:record.hash});if(receipt.status==='success')successful.push({record,receipt});}
 assert.equal(successful.length,1,`${kind} 应有唯一成功部署，请检查重复记录。`);
 const {record,receipt}=successful[0],transaction=await client.getTransaction({hash:record.hash});
 assert.equal(transaction.to,null,'部署交易必须为合约创建');assert.equal(transaction.from.toLowerCase(),plan.expectedDeployer.toLowerCase());assert.equal(transaction.value,0n);
 assert.ok(receipt.contractAddress);assert.equal((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash);assert.ok((await client.getBlockNumber())-receipt.blockNumber+1n>=2n,'至少等待两次确认');
 const bytecode=await client.getCode({address:receipt.contractAddress});assert.ok(bytecode&&bytecode!=='0x');
 const expected=kind==='test-token'?encodeDeployData(artifacts.MockToken):encodeDeployData({...artifacts.AgentEscrowReceiver,args:[verified[0].address,plan.forwarder,plan.plannedWorkflowOwner,creWorkflowName(plan.workflowName)]});
 assert.equal(transaction.input.toLowerCase(),expected.toLowerCase(),'创建字节码或构造参数与准备的源码不一致');
 verified.push({kind,address:receipt.contractAddress,transaction,receipt,runtimeCodeHash:keccak256(bytecode),explorer:`https://sepolia.etherscan.io/tx/${record.hash}`});
}
const token=verified[0].address,receiver=verified[1].address,block=await client.getBlock(),at={address:receiver,abi:artifacts.AgentEscrowReceiver.abi,blockNumber:block.number};
const actual={};for(const functionName of ['token','forwarder','configurator','workflowOwner','workflowName','workflowId','metadataHash'])actual[functionName]=await client.readContract({...at,functionName});
assert.equal(actual.token.toLowerCase(),token.toLowerCase());assert.equal(actual.forwarder.toLowerCase(),plan.forwarder.toLowerCase());assert.equal(actual.configurator.toLowerCase(),plan.expectedDeployer.toLowerCase());assert.equal(actual.workflowOwner.toLowerCase(),plan.plannedWorkflowOwner.toLowerCase());assert.equal(actual.workflowName,creWorkflowName(plan.workflowName));assert.equal(actual.metadataHash,creIdentityHash(actual.workflowName,actual.workflowOwner));assert.equal(actual.workflowId,'0x'+'0'.repeat(64));
for(const [id,expected] of [['0x01ffc9a7',true],['0x805f2132',true],['0xffffffff',false]])assert.equal(await client.readContract({...at,functionName:'supportsInterface',args:[id]}),expected);
const tokenABI=artifacts.MockToken.abi,decimals=await client.readContract({address:token,abi:tokenABI,functionName:'decimals',blockNumber:block.number}),escrowBalance=await client.readContract({address:token,abi:tokenABI,functionName:'balanceOf',args:[receiver],blockNumber:block.number});assert.equal(decimals,6);assert.equal(escrowBalance,0n);
const eventABI=parseAbi(['event WorkflowBound(bytes32 indexed id)','event Opened(bytes32 indexed id,address indexed buyer,address indexed seller,uint256 amount,bytes32 specHash)']);
const events=await client.getContractEvents({address:receiver,abi:eventABI,fromBlock:verified[1].receipt.blockNumber,toBlock:block.number});assert.equal(events.length,0,'接收合约已有绑定或注资事件，应停止本轮未绑定验收');
let rejection;try{await client.simulateContract({...at,functionName:'openTask',args:[keccak256(stringToHex('unbound-sepolia-acceptance')),plan.expectedDeployer,1n,block.timestamp+3600n,keccak256(stringToHex('unfunded-spec'))],account:plan.expectedDeployer});throw Error('Unbound funding unexpectedly allowed');}catch(error){assert.match(error.message,/workflow not bound/);rejection=error.shortMessage??error.message;}
const fingerprints={};for(const file of ['contracts/AgentEscrow.sol','contracts/AgentEscrowReceiver.sol','contracts/test/MockToken.sol'])fingerprints[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const report={status:'passed',scope:'Sepolia test token + unbound CRE receiver; no workflow binding, minting, approval or funding performed by this verifier',checkedAt:new Date().toISOString(),checkedBlock:block.number,checkedBlockHash:block.hash,chainId:11155111,plan,compiler:solc.version(),sourceSHA256:fingerprints,deployments:verified,receiverState:actual,tokenDecimals:decimals,escrowTokenBalance:escrowBalance,bindingOrFundingEvents:events.length,fundingSimulation:{broadcast:false,rejected:true,reason:rejection},pending:['CRE owner linking and deploy access','actual workflow deployment','bind actual workflow ID once','public evidence configuration','explicitly authorized funding and paid feedback/revocation']};
await writeFile(directory+'/deployment-verified.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
await writeFile(directory+'/deployment-unbound.json',JSON.stringify({status:'unbound-not-fundable',chainId:11155111,token,escrow:receiver,forwarder:actual.forwarder,workflowOwner:actual.workflowOwner,workflowName:actual.workflowName,workflowId:actual.workflowId,configurator:actual.configurator,confirmations:2,tokenDeployedBlock:String(verified[0].receipt.blockNumber),receiverDeployedBlock:String(verified[1].receipt.blockNumber),identityRegistry:'0x8004A818BFB912233c491871b3d84c89A494BD9e',reputationRegistry:'0x8004B663056A597Dffe9eCcC1965A193B7388713',installAsActiveChainConfiguration:false},null,2));
console.log(JSON.stringify({status:'passed',token,receiver,workflowId:actual.workflowId,escrowTokenBalance:'0',fundingCallRejected:true,transactions:verified.map(d=>d.explorer),evidence:directory+'/deployment-verified.json'},null,2));
