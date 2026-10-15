import {CronCapability,HTTPClient,EVMClient,handler,Runner,getNetwork,consensusIdenticalAggregation,encodeCallMsg,LAST_FINALIZED_BLOCK_NUMBER,bytesToHex,hexToBase64,type NodeRuntime,type Runtime} from '@chainlink/cre-sdk';
import {encodeAbiParameters,parseAbiParameters,parseAbi,encodeFunctionData,decodeFunctionResult,zeroAddress,type Address,type Hex} from 'viem';
import {specHash,verifyDelivery,type DeliverySpec} from './verify.ts';
type Config={schedule:string;chainName:string;escrowAddress:Address;taskId:Hex;gasLimit:string;spec:DeliverySpec};
const abi=parseAbi(['function taskCommitment(bytes32 id) view returns(bytes32,uint8,uint64)']);
function fetchText(runtime:NodeRuntime<Config>,url:string){
 if(!url.startsWith('https://'))throw new Error('Only configured HTTPS endpoints are permitted');
 const response=new HTTPClient().sendRequest(runtime,{url,method:'GET'}).result();
 if(response.statusCode!==200||response.body.length>1000000)throw new Error('Evidence unavailable or too large; no settlement');
 return new TextDecoder().decode(response.body);
}
function verify(runtime:NodeRuntime<Config>){
 const {spec,taskId}=runtime.config;
 return verifyDelivery(fetchText(runtime,spec.datasetUrl),fetchText(runtime,spec.artifactUrl),taskId,spec.datasetHash);
}
function onCron(runtime:Runtime<Config>){
 const c=runtime.config;
 const network=getNetwork({chainFamily:'evm',chainSelectorName:c.chainName});
 if(!network)throw new Error('Unknown supported network');
 const evm=new EVMClient(network.chainSelector.selector);
 const result=evm.callContract(runtime,{call:encodeCallMsg({from:zeroAddress,to:c.escrowAddress,data:encodeFunctionData({abi,functionName:'taskCommitment',args:[c.taskId]})}),blockNumber:LAST_FINALIZED_BLOCK_NUMBER}).result();
 const [committed,status]=decodeFunctionResult({abi,functionName:'taskCommitment',data:bytesToHex(result.data)});
 if(status!==1)return 'Task is absent or terminal; no write';
 const expected=specHash(c.spec);if(committed!==expected)throw new Error('Configured specification differs from escrow commitment');
 const verdict=runtime.runInNodeMode(verify,consensusIdenticalAggregation<{accepted:boolean;outputHash:Hex}>())().result();
 const payload=encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,bool'),[c.taskId,expected,verdict.outputHash,verdict.accepted]);
 const report=runtime.report({encodedPayload:hexToBase64(payload),encoderName:'evm',signingAlgo:'ecdsa',hashingAlgo:'keccak256'}).result();
 const write=evm.writeReport(runtime,{receiver:c.escrowAddress,report,gasConfig:{gasLimit:c.gasLimit}}).result();
 return bytesToHex(write.txHash||new Uint8Array());
}
export const initWorkflow=(config:Config)=>[handler(new CronCapability().trigger({schedule:config.schedule}),onCron)];
export async function main(){const runner=await Runner.newRunner<Config>();await runner.run(initWorkflow);}
