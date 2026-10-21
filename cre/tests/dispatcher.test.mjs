import {expect} from 'bun:test';
import {test,newTestRuntime,EvmMock,HttpActionsMock,REPORT_METADATA_HEADER_LENGTH} from '@chainlink/cre-sdk/test';
import {getNetwork,hexToBase64,bytesToHex} from '@chainlink/cre-sdk';
import {decodeFunctionData,encodeAbiParameters,parseAbiParameters,parseAbi,decodeAbiParameters,keccak256,stringToHex} from 'viem';
import {onCron} from '../workflow/handler.ts';
import {evidenceRoot,selectReadyIds,SLOT_MILLISECONDS} from '../workflow/dispatcher.ts';
import {deliveryVerification,deliveryArtifact,resultHash,specHash} from '../workflow/verify.ts';
import {expectedOutput} from '../../lib/agentos/engine.ts';

function fixture(){
 const config={mode:'dispatcher',schedule:'*/30 * * * * *',chainName:'ethereum-testnet-sepolia',escrowAddress:'0x'+'11'.repeat(20),gasLimit:'500000',evidenceOrigin:'https://evidence.example'},clock={now:1800000000000},runtime=newTestRuntime(null,{timeProvider:()=>clock.now},config),network=getNetwork({chainFamily:'evm',chainSelectorName:config.chainName}),evm=EvmMock.testInstance(network.chainSelector.selector),http=HttpActionsMock.testInstance(),tasks=new Map(),reports=[],reads=[],requests=[];
 const root=evidenceRoot(config.evidenceOrigin,config.escrowAddress),abi=parseAbi(['function taskCommitment(bytes32 id) view returns(bytes32,uint8,uint64)']);
 function add(name,{bad=false,status=1,latest=status,wrongSpec=false,offline=false,expired=false}={}){
  const taskId=keccak256(stringToHex(name)),input={dataset:'custom-transfers-v1',blockFrom:1,blockTo:2,records:[{block:1,from:'a',to:'b',cents:123},{block:2,from:'a',to:'c',cents:456}]},datasetText=JSON.stringify(input.records),datasetHash=keccak256(stringToHex(datasetText)),verification=deliveryVerification('event-analysis',input),spec={datasetUrl:root+'/dataset/'+datasetHash,artifactUrl:root+'/artifact/'+taskId,datasetHash,verification},output=expectedOutput({skill:'event-analysis',input});if(bad)output.totalCents++;
  const artifactText=JSON.stringify(deliveryArtifact(taskId,verification,datasetHash,output)),task={taskId,spec,datasetText,artifactText,status,latest,wrongSpec,offline,deadline:BigInt(Math.floor(clock.now/1000)+(expired?-1:3600))};tasks.set(taskId,task);return task;
 }
 http.sendRequest=input=>{
  requests.push(input.url);let text;
  if(input.url.startsWith(root+'/ready?slot=')){const slot=Number(input.url.split('=').at(-1)),ids=[...tasks.keys()].sort();text=JSON.stringify({version:'agentos.ready.v1',chainId:11155111,escrow:config.escrowAddress,slot,total:ids.length,indexHash:resultHash(ids),items:selectReadyIds(ids,slot).map(id=>({taskId:id,spec:tasks.get(id).spec}))});}
  else{const task=[...tasks.values()].find(t=>[t.spec.datasetUrl,t.spec.artifactUrl].includes(input.url));if(!task||task.offline&&input.url===task.spec.artifactUrl)return {statusCode:503,body:''};text=input.url===task.spec.datasetUrl?task.datasetText:task.artifactText;}
  return {statusCode:200,body:Buffer.from(text).toString('base64')};
 };
 evm.callContract=input=>{
  expect(bytesToHex(input.call.to).toLowerCase()).toBe(config.escrowAddress);const id=decodeFunctionData({abi,data:bytesToHex(input.call.data)}).args[0],task=tasks.get(id),latest=input.blockNumber?.absVal?.[0]===2;reads.push({id,latest});
  return {data:hexToBase64(encodeAbiParameters(parseAbiParameters('bytes32,uint8,uint64'),[task.wrongSpec?resultHash('wrong'):specHash(task.spec),latest?task.latest:task.status,task.deadline]))};
 };
 evm.writeReport=input=>{const values=decodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,bool'),bytesToHex(input.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH)));reports.push(values);return {txStatus:'TX_STATUS_SUCCESS',receiverContractExecutionStatus:'RECEIVER_CONTRACT_EXECUTION_STATUS_SUCCESS',txHash:hexToBase64(keccak256(stringToHex('test transaction '+reports.length)))};};
 return {config,clock,runtime,tasks,reports,reads,requests,evm,http,add,run:()=>JSON.parse(onCron(runtime))};
}
test('one unchanged dispatcher discovers new tasks, reports valid/invalid delivery, and skips current terminal tasks',()=>{
 const f=fixture(),first=f.add('first'),second=f.add('bad',{bad:true}),original=JSON.stringify(f.config),result=f.run();expect(result.outcomes.every(o=>o.status==='reported')).toBe(true);expect(f.reports).toHaveLength(2);
 for(const [id,commitment,outputHash,accepted] of f.reports){const task=f.tasks.get(id);expect(commitment).toBe(specHash(task.spec));expect(outputHash).toBe(resultHash(JSON.parse(task.artifactText)));expect(accepted).toBe(id!==second.taskId);task.latest=accepted?2:3;}
 const repeated=f.run();expect(repeated.outcomes.every(o=>o.status==='changed-or-terminal')).toBe(true);expect(f.reports).toHaveLength(2);f.add('new-after-first-tick');
 for(let i=0;i<2;i++){f.clock.now+=SLOT_MILLISECONDS;f.run();}
 expect(f.reports.some(r=>r[0]!==first.taskId&&r[0]!==second.taskId)).toBe(true);expect(JSON.stringify(f.config)).toBe(original);expect(f.reads.some(r=>!r.latest)).toBe(true);expect(f.reads.some(r=>r.latest)).toBe(true);
});
test('bad commitments, unavailable artifacts, expired and unfinalized tasks never produce a report or stop another task',()=>{
 for(const options of [{wrongSpec:true},{offline:true},{expired:true},{status:0},{latest:2}]){
  const f=fixture(),bad=f.add('unpayable',options),good=f.add('payable'),result=f.run();expect(f.reports).toHaveLength(1);expect(f.reports[0][0]).toBe(good.taskId);expect(result.outcomes.find(o=>o.taskId===bad.taskId).status).not.toBe('reported');
 }
});
test('failed receiver callback is deferred and a malicious feed cannot send HTTP outside the configured service',()=>{
 const f=fixture();f.add('receiver-failure');f.evm.writeReport=()=>({txStatus:'TX_STATUS_SUCCESS',receiverContractExecutionStatus:'RECEIVER_CONTRACT_EXECUTION_STATUS_REVERTED'});expect(f.run().outcomes[0].status).toBe('deferred');
 const task=[...f.tasks.values()][0];task.spec.datasetUrl='https://attacker.example/private';expect(()=>f.run()).toThrow();expect(f.requests.some(url=>url.includes('attacker.example'))).toBe(false);
});
