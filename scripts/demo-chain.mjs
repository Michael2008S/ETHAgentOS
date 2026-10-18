import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,keccak256,stringToHex,parseAbi} from 'viem';
import {AgentChainClient,encodeSettlementReport} from '../sdk/chain.ts';
import {AgentOSClient} from '../sdk/index.ts';
import {DATASET} from '../lib/agentos/engine.ts';
import {verifyDelivery} from '../cre/workflow/verify.ts';
import {compile} from './compile-contracts.mjs';

const base=process.env.AGENTOS_TEST_URL||'http://127.0.0.1:5177';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Chain demo uses a loopback workspace and a new local EVM only.');
const workspace='chain-demo-'+crypto.randomUUID(),os=new AgentOSClient(base,{'x-agentos-sandbox':workspace});
const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',chainId:31337}});
const client=createPublicClient({transport:custom(provider)}),wallet=createWalletClient({transport:custom(provider),chain:null});
const [buyer,seller,forwarder]=await wallet.getAddresses(),artifacts=compile();
const report={version:1,mode:'local-evm-integration',attestation:'local verifier; not a Chainlink DON report',startedAt:new Date().toISOString(),workspace,cases:[]};
async function write(address,abi,functionName,args=[],account=buyer){const hash=await wallet.writeContract({address,abi,functionName,args,account,gas:6000000n});return client.waitForTransactionReceipt({hash});}
async function deploy(name,args=[]){const hash=await wallet.deployContract({...artifacts[name],account:buyer,args,gas:6000000n});const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return receipt.contractAddress;}
async function sign(tx){const hash=await wallet.sendTransaction({...tx,account:buyer,gas:6000000n});const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return receipt;}
try{
  const token=await deploy('MockToken'),metadata=stringToHex('agentos-local-verifier:v1'),metadataHash=keccak256(metadata),escrow=await deploy('AgentEscrow',[token,forwarder,metadataHash]);
  const deployment={chainId:31337,token,escrow,forwarder,metadataHash,confirmations:1};report.deployment=deployment;
  const chain=new AgentChainClient(client,deployment);
  await write(token,artifacts.MockToken.abi,'mint',[buyer,20000000n]);
  const onReportABI=parseAbi(['function onReport(bytes metadata,bytes report)']);
  for(const scenario of ['success','invalid-delivery','timeout']){
    const input={dataset:'custom-transfers-v1',blockFrom:0,blockTo:20,records:[{block:12,from:'buyer.eth',to:'builder.eth',cents:3210},{block:17,from:'buyer.eth',to:'research.eth',cents:6540}]};
    const web=await os.createTask({agentId:'atlas',title:'EVM integration: '+scenario,budget:1000,input,scenario:scenario==='invalid-delivery'?'invalid-delivery':'success'});
    const completed=await os.run(web.id);
    assert.equal(completed.status,scenario==='invalid-delivery'?'refunded':'completed');
    assert.equal(completed.output.totalCents,scenario==='invalid-delivery'?9751:9750);
    const dataset=JSON.stringify((completed.input.records??DATASET).filter(row=>row.block>=completed.input.blockFrom&&row.block<=completed.input.blockTo)),datasetHash=keccak256(stringToHex(dataset));
    const spec={datasetUrl:'https://evidence.example/committed-transfers.json',datasetHash,artifactUrl:`https://delivery.example/${web.id}.json`};
    // URLs are commitments for this local test, not live HTTP endpoints; the real fetched bytes are supplied below.
    const {intent,transactions}=await chain.prepareFunding({workspace,taskId:web.id,buyer,seller,quoteCents:completed.quote,deadline:(await client.getBlock()).timestamp+120n,spec});
    let funding;for(const tx of transactions)funding=await sign(tx);
    const funded=await chain.verifyEvidence(intent,funding.transactionHash,'funding');
    let settlement,expectedHash;
    if(scenario==='timeout'){
      await provider.request({method:'evm_increaseTime',params:[121]});await provider.request({method:'evm_mine',params:[]});
      settlement=await sign(chain.refundTransaction(intent.id));
    }else{
      const artifact=JSON.stringify({taskId:intent.id,totalCents:completed.output.totalCents,transferCount:completed.output.transferCount});
      const verdict=verifyDelivery(dataset,artifact,intent.id,datasetHash);assert.equal(verdict.accepted,scenario==='success');expectedHash=verdict.outputHash;
      const payload=encodeSettlementReport(intent.id,intent.specHash,verdict.outputHash,verdict.accepted);
      settlement=await write(escrow,onReportABI,'onReport',[metadata,payload],forwarder);assert.equal(settlement.status,'success');
      const replay=await write(escrow,onReportABI,'onReport',[metadata,payload],forwarder);assert.equal(replay.status,'reverted');
    }
    const settled=await chain.verifyEvidence(intent,settlement.transactionHash,'settlement',expectedHash);
    assert.equal(settled.status,scenario==='success'?'paid':'refunded');
    report.cases.push({scenario,webTaskId:web.id,webStatus:completed.status,input:completed.input,inputHash:completed.inputHash,totalCents:completed.output.totalCents,funding:funded,settlement:settled});
    console.log(`PASS web artifact → committed evidence → local verification → EVM ${settled.status}: ${scenario}`);
  }
  const sellerBalance=await client.readContract({address:token,abi:artifacts.MockToken.abi,functionName:'balanceOf',args:[seller]});
  const escrowBalance=await client.readContract({address:token,abi:artifacts.MockToken.abi,functionName:'balanceOf',args:[escrow]});
  assert.equal(sellerBalance,2400000n);assert.equal(escrowBalance,0n);report.balances={seller:sellerBalance.toString(),escrow:escrowBalance.toString()};report.status='passed';
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);console.error(report.error);process.exitCode=1;}
finally{await provider.disconnect();}
report.finishedAt=new Date().toISOString();await mkdir('outputs',{recursive:true});const path=`outputs/${workspace}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log('Chain evidence: '+path);
