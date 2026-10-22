import {ExactEvmScheme as ClientScheme} from '@x402/evm/exact/client';
import {ExactEvmScheme as FacilitatorScheme} from '@x402/evm/exact/facilitator';
import {authorizationTypes} from '@x402/evm';
import {encodePaymentSignatureHeader,decodePaymentRequiredHeader,encodePaymentRequiredHeader,decodePaymentSignatureHeader,encodePaymentResponseHeader,decodePaymentResponseHeader} from '@x402/core/http';
import {declarePaymentIdentifierExtension,appendPaymentIdentifierToExtensions,extractPaymentIdentifier} from '@x402/extensions/payment-identifier';
import {parseAbi,decodeEventLog,verifyTypedData} from 'viem';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest} from '../../lib/agentos/engine.ts';
import {checkX402Requirements,checkX402TypedData} from '../../lib/agentos/x402-policy.ts';
export {encodePaymentSignatureHeader,decodePaymentRequiredHeader,encodePaymentRequiredHeader,decodePaymentSignatureHeader,encodePaymentResponseHeader,decodePaymentResponseHeader,declarePaymentIdentifierExtension,extractPaymentIdentifier};
export const authorizationABI=parseAbi(['function authorizationState(address,bytes32) view returns(bool)','event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const lower=v=>v.toLowerCase();

export async function createPayload(policy,requirements,resource,account,paymentId,beforeSign=async()=>{}){
 const r=checkX402Requirements(requirements,policy),extensions={'payment-identifier':declarePaymentIdentifierExtension(true)};
 appendPaymentIdentifierToExtensions(extensions,paymentId);
 const signer={address:account.address,async signTypedData(data){checkX402TypedData(data,policy,account.address,r.amount);await beforeSign(data);return account.signTypedData(data);}};
 const result=await new ClientScheme(signer).createPaymentPayload(2,r);
 return {...result,accepted:r,resource,extensions};
}
export async function checkPayloadSignature(payload,requirements){
 if(payload.x402Version!==2||canonical(payload.accepted)!==canonical(requirements))throw Error('x402 payment requirements differ.');
 const {authorization:a,signature}=payload.payload;
 const valid=await verifyTypedData({address:a.from,domain:{name:requirements.extra.name,version:requirements.extra.version,chainId:31337,verifyingContract:requirements.asset},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:{...a,value:BigInt(a.value),validAfter:BigInt(a.validAfter),validBefore:BigInt(a.validBefore)},signature});
 if(!valid)throw Error('Invalid x402 payment signature.');
 return a;
}
/** A token nonce and a canonical Transfer must agree; a facilitator's JSON is not proof. */
export async function reconcilePayment(client,token,payload,transactionHash){
 if(await client.getChainId()!==31337)throw Error('Local x402 chain required.');
 const a=payload.payload.authorization;
 const used=await client.readContract({address:token,abi:authorizationABI,functionName:'authorizationState',args:[a.from,a.nonce]});
 if(!used)return null;
 if(!transactionHash){const logs=await client.getContractEvents({address:token,abi:authorizationABI,eventName:'AuthorizationUsed',args:{authorizer:a.from,nonce:a.nonce},fromBlock:0n,toBlock:'latest'});if(logs.length!==1)throw Error('Canonical authorization event required.');transactionHash=logs[0].transactionHash;}
 const receipt=await client.getTransactionReceipt({hash:transactionHash}),block=await client.getBlock({blockNumber:receipt.blockNumber});
 if(receipt.status!=='success'||block.hash!==receipt.blockHash)throw Error('Canonical successful payment required.');
 const events=receipt.logs.filter(l=>lower(l.address)===lower(token)).flatMap(l=>{try{return [decodeEventLog({abi:authorizationABI,data:l.data,topics:l.topics})];}catch{return [];}});
 if(!events.some(e=>e.eventName==='AuthorizationUsed'&&lower(e.args.authorizer)===lower(a.from)&&e.args.nonce===a.nonce)||!events.some(e=>e.eventName==='Transfer'&&lower(e.args.from)===lower(a.from)&&lower(e.args.to)===lower(a.to)&&e.args.value===BigInt(a.value)))throw Error('x402 transfer differs from its signed intent.');
 return {success:true,transaction:transactionHash,network:'eip155:31337',payer:a.from,amount:a.value,asset:token,payTo:a.to,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash};
}
export function facilitator(signer,client,token,journal){
 const scheme=new FacilitatorScheme(signer,{simulateInSettle:true});let pending=Promise.resolve();
 return {verify:(payload,r)=>scheme.verify(payload,r),settle(payload,r){const run=pending.then(async()=>{
  await checkPayloadSignature(payload,r);
  const key=await digest(payload),old=journal.get('settlements',key),prior=await reconcilePayment(client,token,payload,old?.transaction);
  if(prior)return prior;
  const result=await scheme.settle(payload,r);journal.put('settlements',key,result);
  if(!result.success)throw Error('Official x402 settlement failed: '+result.errorReason);
  const proof=await reconcilePayment(client,token,payload,result.transaction);if(!proof)throw Error('x402 payment not confirmed.');return proof;
 });pending=run.catch(()=>{});return run;}};
}
