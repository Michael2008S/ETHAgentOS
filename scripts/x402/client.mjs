import {verifyMessage} from 'viem';
import {authorizationTypes} from '@x402/evm';
import {declarePaymentIdentifierExtension,appendPaymentIdentifierToExtensions} from '@x402/extensions/payment-identifier';
import {digest} from '../../lib/agentos/engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {checkX402Requirements,checkX402TypedData} from '../../lib/agentos/x402-policy.ts';
import {createPayload,decodePaymentRequiredHeader,encodePaymentSignatureHeader,reconcilePayment} from './protocol.mjs';
import {responseJson} from './http.mjs';
import {reportMessage} from './report-service.mjs';

const jsonSafe=v=>JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x));
/** The only component holding the supplier's procurement EOA. Never receives a Vault key. */
export function procurementClient({policy,account,client,store,authorize,afterPersist=async()=>{},afterPayment=async()=>{}}){
 const locks=new Map();
 async function execute(request,ticket){
  const id=request.jobId,binding={jobId:id,inputHash:request.inputHash,requestHash:await digest(request),policyHash:await digest(policy),network:policy.network,asset:policy.asset,payer:account.address.toLowerCase()};
  let row=store.get('purchases',id);
  if(row?.state==='unpaid')throw Object.assign(Error('The original procurement ended without payment.'),{terminal:true});
  if(row&&canonical(row.binding)!==canonical(binding))throw Object.assign(Error('Conflicting x402 procurement request.'),{terminal:true});
  const recordPayment=async()=>{if(!row?.payload)return null;const proof=await reconcilePayment(client,policy.asset,row.payload,row.payment?.transaction);if(proof){row=store.update(id,{payment:proof,state:row.report?'delivered':'paid'});}return proof;};
  await recordPayment();
  if(row?.report)return {report:row.report,payment:row.payment};
  await authorize(ticket,{action:'preflight',jobId:id});
  if(!row){
   const response=await fetch(policy.upstreamOrigin+policy.path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(10000)});
   if(response.status!==402){await response.body?.cancel();throw Object.assign(Error('Configured x402 service did not offer a payment challenge.'),{terminal:response.status<500});}
   let required;try{const header=response.headers.get('PAYMENT-REQUIRED');if(!header||header.length>16384)throw Error();required=decodePaymentRequiredHeader(header);}finally{await response.body?.cancel();}
   if(required.x402Version!==2||required.resource?.url!==policy.upstreamOrigin+policy.path||required.accepts?.length!==1||required.extensions?.['payment-identifier']?.info?.required!==true)throw Object.assign(Error('Unsupported x402 resource or protocol.'),{terminal:true});
   const requirements=checkX402Requirements(required.accepts[0],policy);
   row=store.reserve(id,binding,requirements.amount,policy.dailyAmount,{requirements,resource:required.resource,paymentId:'pay_'+crypto.randomUUID()});
  }
  const beforeSign=async data=>{
   checkX402TypedData(data,policy,account.address,row.amount);
   const intent=jsonSafe(data);store.intent(id,intent);
   await authorize(ticket,{action:'commit',jobId:id,nonce:data.message.nonce,intentHash:await digest(intent)});
  };
  if(!row.payload){
   let payload;
   if(row.intent){
    // SDK-generated typed data was persisted before the crash. Do not invoke its random nonce generator again.
    const data={...row.intent,types:authorizationTypes};await beforeSign(data);const signature=await account.signTypedData(data),a=data.message,extensions={'payment-identifier':declarePaymentIdentifierExtension(true)};appendPaymentIdentifierToExtensions(extensions,row.paymentId);
    payload={x402Version:2,accepted:row.requirements,resource:row.resource,extensions,payload:{signature,authorization:{from:a.from,to:a.to,value:String(a.value),validAfter:String(a.validAfter),validBefore:String(a.validBefore),nonce:a.nonce}}};
   }else payload=await createPayload(policy,row.requirements,row.resource,account,row.paymentId,beforeSign);
   row=store.update(id,{payload,state:'authorized'});await afterPersist(row);
  }
  for(let attempt=0;attempt<policy.maxTransportRetries;attempt++){
   await authorize(ticket,{action:'commit',jobId:id,nonce:row.payload.payload.authorization.nonce,intentHash:await digest(row.intent??store.get('purchases',id).intent)});
   try{
    row=store.update(id,{state:row.payment?'paid':'submitted'});
    const response=await fetch(policy.upstreamOrigin+policy.path,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','PAYMENT-SIGNATURE':encodePaymentSignatureHeader(row.payload)},body:JSON.stringify(request),signal:AbortSignal.timeout(10000)});
    if(!response.ok){await response.body?.cancel();if(response.status<500&&response.status!==429)throw Object.assign(Error('Original x402 payment refused; reconcile without a new authorization.'),{terminal:true});throw Error('x402 response unavailable.');}
    const report=await responseJson(response,65536),t=report.terms;
    if(!t||t.version!=='agentos.x402-report.v1'||t.jobId!==id||t.inputHash!==request.inputHash||t.paymentId!==row.paymentId||t.nonce!==row.payload.payload.authorization.nonce||t.payer!==account.address.toLowerCase()||t.outputHash!==await digest(t.output)||!await verifyMessage({address:policy.providerSigner,message:reportMessage(t),signature:report.signature}))throw Object.assign(Error('x402 report signature or request commitment differs.'),{terminal:true});
    const payment=await recordPayment();if(!payment)throw Error('x402 payment is not confirmed.');await afterPayment(row);
    row=store.update(id,{report,state:'delivered'});return {report,payment};
   }catch(error){
    await recordPayment();
    if(error.terminal)throw error;
    if(attempt+1===policy.maxTransportRetries)throw Error('Original x402 purchase awaits response recovery.');
   }
  }
 }
 return {async execute(request,ticket){if(!locks.has(request.jobId))locks.set(request.jobId,execute(request,ticket).finally(()=>locks.delete(request.jobId)));return locks.get(request.jobId);},async reconcile(id){const row=store.get('purchases',id);if(!row?.payload)return row;const proof=await reconcilePayment(client,policy.asset,row.payload,row.payment?.transaction);if(proof)return store.update(id,{payment:proof,state:row.report?'delivered':'paid'});const head=await client.getBlock();if(BigInt(row.payload.payload.authorization.validBefore)<head.timestamp)return store.update(id,{state:'unpaid'});return row;}};
}
