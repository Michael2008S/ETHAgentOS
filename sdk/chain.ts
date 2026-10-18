import { decodeEventLog, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, parseAbiParameters, stringToHex, type Address, type Hex, type PublicClient } from 'viem';
import { specHash, type DeliverySpec } from '../cre/workflow/verify.ts';

export const escrowABI = parseAbi([
  'function token() view returns(address)',
  'function forwarder() view returns(address)',
  'function metadataHash() view returns(bytes32)',
  'function tasks(bytes32) view returns(address buyer,address seller,uint256 amount,uint64 deadline,bytes32 specHash,uint8 status,bytes32 outputHash)',
  'function openTask(bytes32 id,address seller,uint256 amount,uint64 deadline,bytes32 specHash)',
  'function refundExpired(bytes32 id)',
  'event Opened(bytes32 indexed id,address indexed buyer,address indexed seller,uint256 amount,bytes32 specHash)',
  'event Settled(bytes32 indexed id,bool accepted,bytes32 outputHash)',
]);
export const tokenABI = parseAbi([
  'function decimals() view returns(uint8)',
  'function balanceOf(address owner) view returns(uint256)',
  'function allowance(address owner,address spender) view returns(uint256)',
  'function approve(address spender,uint256 amount) returns(bool)',
]);
export type ChainDeployment = {chainId:number;escrow:Address;token:Address;forwarder:Address;metadataHash:Hex;confirmations:number};
export type ChainIntent = {id:Hex;buyer:Address;seller:Address;amount:bigint;deadline:bigint;specHash:Hex};
export type TransactionIntent = {to:Address;data:Hex};
export type ChainEvidence = {
  version:'agentos.chain-evidence.v1';chainId:number;escrow:Address;token:Address;
  taskId:Hex;buyer:Address;seller:Address;amount:string;specHash:Hex;outputHash:Hex;
  status:'funded'|'paid'|'refunded';phase:'funding'|'settlement';
  transactionHash:Hex;blockHash:Hex;blockNumber:string;confirmations:number;
};
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
const address=(value:string)=>/^0x[0-9a-fA-F]{40}$/.test(value)&&!/^0x0{40}$/.test(value);
const hash=(value:string)=>/^0x[0-9a-fA-F]{64}$/.test(value);

/** Preserve exact cents; never silently round a budget into token base units. */
export function centsToToken(cents:number,decimals:number):bigint {
  if(!Number.isSafeInteger(cents)||cents<=0||!Number.isInteger(decimals)||decimals<0||decimals>36)throw new Error('Invalid amount or token decimals.');
  const scaled=BigInt(cents)*10n**BigInt(decimals);
  if(scaled%100n)throw new Error('Token precision cannot represent this amount exactly.');
  return scaled/100n;
}
export function chainTaskId(workspace:string,taskId:string):Hex {
  if(!workspace||!taskId)throw new Error('Workspace and task identifiers are required.');
  return keccak256(encodeAbiParameters(parseAbiParameters('string,string,string'),['agentos.task.v1',workspace,taskId]));
}
export function encodeSettlementReport(id:Hex,spec:Hex,output:Hex,accepted:boolean):Hex {
  return encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,bool'),[id,spec,output,accepted]);
}

/** Builds unsigned owner transactions and verifies mined onchain evidence. Never holds a key. */
export class AgentChainClient {
  client:PublicClient;
  deployment:ChainDeployment;
  constructor(client:PublicClient,deployment:ChainDeployment){
    if(!Number.isSafeInteger(deployment.chainId)||deployment.chainId<=0||!Number.isSafeInteger(deployment.confirmations)||deployment.confirmations<1||![deployment.escrow,deployment.token,deployment.forwarder].every(address)||!hash(deployment.metadataHash))throw new Error('Invalid chain deployment.');
    this.client=client;this.deployment=deployment;
  }
  async validateDeployment(){
    const c=this.client,d=this.deployment;
    if(await c.getChainId()!==d.chainId)throw new Error('RPC chain does not match the configured chain.');
    const [token,forwarder,metadata,decimals]=await Promise.all([
      c.readContract({address:d.escrow,abi:escrowABI,functionName:'token'}),
      c.readContract({address:d.escrow,abi:escrowABI,functionName:'forwarder'}),
      c.readContract({address:d.escrow,abi:escrowABI,functionName:'metadataHash'}),
      c.readContract({address:d.token,abi:tokenABI,functionName:'decimals'}),
    ]);
    if(!same(token,d.token)||!same(forwarder,d.forwarder)||!same(metadata,d.metadataHash))throw new Error('Escrow deployment identity does not match configuration.');
    if(decimals>36)throw new Error('Unsupported token precision.');
    return {decimals};
  }
  async prepareFunding(input:{workspace:string;taskId:string;buyer:Address;seller:Address;quoteCents:number;deadline:bigint;spec:DeliverySpec}){
    if(!address(input.buyer)||!address(input.seller))throw new Error('Invalid funding parties.');
    const {decimals}=await this.validateDeployment();
    const amount=centsToToken(input.quoteCents,decimals),id=chainTaskId(input.workspace,input.taskId),commitment=specHash(input.spec),d=this.deployment;
    const [balance,allowance,current,block]=await Promise.all([
      this.client.readContract({address:d.token,abi:tokenABI,functionName:'balanceOf',args:[input.buyer]}),
      this.client.readContract({address:d.token,abi:tokenABI,functionName:'allowance',args:[input.buyer,d.escrow]}),
      this.client.readContract({address:d.escrow,abi:escrowABI,functionName:'tasks',args:[id]}),
      this.client.getBlock(),
    ]);
    if(current[5]!==0)throw new Error('Task already exists onchain; reconcile instead of funding again.');
    if(input.deadline<=block.timestamp||input.deadline>block.timestamp+604800n)throw new Error('Deadline must be within the next seven days.');
    if(balance<amount)throw new Error('Insufficient token balance.');
    const transactions:TransactionIntent[]=[];
    if(allowance<amount){
      if(allowance>0n)transactions.push({to:d.token,data:encodeFunctionData({abi:tokenABI,functionName:'approve',args:[d.escrow,0n]})});
      transactions.push({to:d.token,data:encodeFunctionData({abi:tokenABI,functionName:'approve',args:[d.escrow,amount]})});
    }
    transactions.push({to:d.escrow,data:encodeFunctionData({abi:escrowABI,functionName:'openTask',args:[id,input.seller,amount,input.deadline,commitment]})});
    const intent:ChainIntent={id,buyer:input.buyer,seller:input.seller,amount,deadline:input.deadline,specHash:commitment};
    return {intent,transactions,decimals};
  }
  refundTransaction(id:Hex):TransactionIntent {
    return {to:this.deployment.escrow,data:encodeFunctionData({abi:escrowABI,functionName:'refundExpired',args:[id]})};
  }
  async verifyEvidence(intent:ChainIntent,transactionHash:Hex,phase:'funding'|'settlement',expectedOutputHash?:Hex):Promise<ChainEvidence>{
    await this.validateDeployment();
    const c=this.client,d=this.deployment,receipt=await c.getTransactionReceipt({hash:transactionHash});
    if(receipt.status!=='success')throw new Error('Transaction reverted.');
    const tip=await c.getBlockNumber({cacheTime:0}),confirmations=Number(tip-receipt.blockNumber+1n);
    if(confirmations<d.confirmations)throw new Error('Transaction is not sufficiently confirmed.');
    const block=await c.getBlock({blockNumber:receipt.blockNumber});
    if(block.hash!==receipt.blockHash)throw new Error('Transaction block is no longer canonical.');
    const task=await c.readContract({address:d.escrow,abi:escrowABI,functionName:'tasks',args:[intent.id],blockNumber:receipt.blockNumber});
    const [buyer,seller,amount,deadline,spec,taskStatus,output]=task;
    if(!same(buyer,intent.buyer)||!same(seller,intent.seller)||amount!==intent.amount||deadline!==intent.deadline||spec!==intent.specHash)throw new Error('Onchain task does not match the committed intent.');
    let matched=false;
    for(const log of receipt.logs){
      if(!same(log.address,d.escrow))continue;
      try {
        const event=decodeEventLog({abi:escrowABI,data:log.data,topics:log.topics});
        if(phase==='funding'&&event.eventName==='Opened'&&event.args.id===intent.id&&same(event.args.buyer,intent.buyer)&&same(event.args.seller,intent.seller)&&event.args.amount===intent.amount&&event.args.specHash===intent.specHash&&taskStatus===1)matched=true;
        if(phase==='settlement'&&event.eventName==='Settled'&&event.args.id===intent.id&&((event.args.accepted&&taskStatus===2)||(!event.args.accepted&&taskStatus===3))&&event.args.outputHash===output)matched=true;
      }catch{/* Ignore unrelated logs, never infer success from transaction status alone. */}
    }
    if(!matched)throw new Error('Expected task event is absent from this transaction.');
    if(expectedOutputHash&&output!==expectedOutputHash)throw new Error('Settled output commitment differs from the verified delivery.');
    return {version:'agentos.chain-evidence.v1',chainId:d.chainId,escrow:d.escrow,token:d.token,taskId:intent.id,buyer,seller,amount:amount.toString(),specHash:spec,outputHash:output,status:taskStatus===1?'funded':taskStatus===2?'paid':'refunded',phase,transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString(),confirmations};
  }
}
