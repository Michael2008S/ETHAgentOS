import {HTTPClient,EVMClient,getNetwork,consensusIdenticalAggregation,encodeCallMsg,LAST_FINALIZED_BLOCK_NUMBER,LATEST_BLOCK_NUMBER,bytesToHex,hexToBase64,type NodeRuntime,type Runtime} from '@chainlink/cre-sdk';
import {encodeAbiParameters,parseAbiParameters,parseAbi,encodeFunctionData,decodeFunctionResult,zeroAddress,type Address,type Hex} from 'viem';
import {specHash,verifyDelivery,type DeliverySpec} from './verify.ts';
import type {Config} from './config.ts';
import {evidenceRoot,validateReadyBatch,SLOT_MILLISECONDS,type ReadyItem,type ReadyBatch} from './dispatcher.ts';
import {EVM_PB} from '@chainlink/cre-sdk/pb';
const abi=parseAbi(['function taskCommitment(bytes32 id) view returns(bytes32,uint8,uint64)']);
function fetchText(runtime:NodeRuntime<Config>,url:string){
 if(!url.startsWith('https://'))throw new Error('Only configured HTTPS endpoints are permitted');
 const response=new HTTPClient().sendRequest(runtime,{url,method:'GET'}).result();
 if(response.statusCode!==200||response.body.length>1000000)throw new Error('Evidence unavailable or too large; no settlement');
 return new TextDecoder().decode(response.body);
}
function verify(runtime:NodeRuntime<Config>,task:ReadyItem){
 const {spec,taskId}=task;
 return verifyDelivery(fetchText(runtime,spec.datasetUrl),fetchText(runtime,spec.artifactUrl),taskId,spec);
}
function readReady(runtime:NodeRuntime<Config>,slot:number){
 const c=runtime.config;if(!('mode' in c))throw new Error('Dispatcher configuration required');
 return validateReadyBatch(JSON.parse(fetchText(runtime,evidenceRoot(c.evidenceOrigin,c.escrowAddress)+'/ready?slot='+slot)),c,slot);
}
export function onCron(runtime:Runtime<Config>):string{
 const c=runtime.config;
 const network=getNetwork({chainFamily:'evm',chainSelectorName:c.chainName});
 if(!network)throw new Error('Unknown supported network');
 const evm=new EVMClient(network.chainSelector.selector);
 const inspect=(taskId:Hex,blockNumber:typeof LAST_FINALIZED_BLOCK_NUMBER)=>{
  const result=evm.callContract(runtime,{call:encodeCallMsg({from:zeroAddress,to:c.escrowAddress,data:encodeFunctionData({abi,functionName:'taskCommitment',args:[taskId]})}),blockNumber}).result();
  return decodeFunctionResult({abi,functionName:'taskCommitment',data:bytesToHex(result.data)});
 };
 const reportTask=(task:ReadyItem)=>{
  const verdict=runtime.runInNodeMode(verify,consensusIdenticalAggregation<{accepted:boolean;outputHash:Hex}>())(task).result();
  runtime.log('Delivery consensus: accepted='+verdict.accepted+' outputHash='+verdict.outputHash);
  const payload=encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,bool'),[task.taskId,specHash(task.spec),verdict.outputHash,verdict.accepted]);
  const report=runtime.report({encodedPayload:hexToBase64(payload),encoderName:'evm',signingAlgo:'ecdsa',hashingAlgo:'keccak256'}).result();
  runtime.log('CRE report generated; submitting through EVM capability');
  const write=evm.writeReport(runtime,{receiver:c.escrowAddress,report,gasConfig:{gasLimit:c.gasLimit}}).result();
  if(write.txStatus!==EVM_PB.TxStatus.SUCCESS||write.receiverContractExecutionStatus===EVM_PB.ReceiverContractExecutionStatus.REVERTED)throw new Error('Report transmission or receiver execution failed');
  return {taskId:task.taskId,accepted:verdict.accepted,outputHash:verdict.outputHash,transactionHash:bytesToHex(write.txHash||new Uint8Array())};
 };
 if('mode' in c){
  const slot=Math.floor(runtime.now().getTime()/SLOT_MILLISECONDS),batch=runtime.runInNodeMode(readReady,consensusIdenticalAggregation<ReadyBatch>())(slot).result(),outcomes:Record<string,unknown>[]=[];
  for(const task of batch.items){
   try{
    const [committed,status,deadline]=inspect(task.taskId,LAST_FINALIZED_BLOCK_NUMBER);
    if(status!==1){outcomes.push({taskId:task.taskId,status:status===0?'not-finalized':'terminal'});continue;}
    if(deadline<=BigInt(Math.floor(runtime.now().getTime()/1000))){outcomes.push({taskId:task.taskId,status:'expired'});continue;}
    if(committed!==specHash(task.spec)){outcomes.push({taskId:task.taskId,status:'commitment-mismatch'});continue;}
    const [current,currentStatus,currentDeadline]=inspect(task.taskId,LATEST_BLOCK_NUMBER);
    if(currentStatus!==1||current!==committed||currentDeadline!==deadline){outcomes.push({taskId:task.taskId,status:'changed-or-terminal'});continue;}
    runtime.log('Task commitment verified against finalized chain state');
    outcomes.push({status:'reported',...reportTask(task)});
   }catch{runtime.log('Dispatcher task deferred: '+task.taskId);outcomes.push({taskId:task.taskId,status:'deferred'});}
  }
  return JSON.stringify({mode:'dispatcher',slot,indexHash:batch.indexHash,outcomes});
 }
 const [committed,status]=inspect(c.taskId,LAST_FINALIZED_BLOCK_NUMBER);
 if(status!==1)return 'Task is absent or terminal; no write';
 const expected=specHash(c.spec);if(committed!==expected)throw new Error('Configured specification differs from escrow commitment');
 runtime.log('Task commitment verified against finalized chain state');
 return JSON.stringify(reportTask({taskId:c.taskId,spec:c.spec}));
}
