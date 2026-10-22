import {digest} from '../../lib/agentos/engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {sourceSummary} from '../../lib/agentos/transfer-source.ts';
import {checkX402ReportRequest,x402RequirementsSchema} from '../../lib/agentos/x402-policy.ts';
import {localServer,readJson,jsonCall} from './http.mjs';
import {Journal} from './storage.mjs';
import {decodePaymentSignatureHeader,encodePaymentRequiredHeader,encodePaymentResponseHeader,declarePaymentIdentifierExtension,extractPaymentIdentifier,checkPayloadSignature} from './protocol.mjs';

export const reportMessage=terms=>'AgentOS x402 report v1\n'+canonical(terms);
/** Deliberately separate arithmetic from the runtime/CRE verifier implementation. */
export function computeReport(input){
 let total=0n,count=0;const recipients=new Map();
 for(const row of input.records){if(row.block<input.blockFrom||row.block>input.blockTo)continue;total+=BigInt(row.cents);count++;recipients.set(row.to,(recipients.get(row.to)??0n)+BigInt(row.cents));}
 if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Report total exceeds its integer bound.');
 return {dataset:input.dataset,blockFrom:input.blockFrom,blockTo:input.blockTo,transferCount:count,totalCents:Number(total),allocations:Object.fromEntries([...recipients].map(([k,v])=>[k,Number(v)])),...(input.source?{source:sourceSummary(input.source,'treasury-report')}:{})};
}
export async function startReportService({asset,payTo,account,facilitatorOrigin,port=0,journalPath,amount='200000'}){
 const journal=new Journal(journalPath),locks=new Map();let mode='healthy';
 const requirements=()=>x402RequirementsSchema.parse({scheme:'exact',network:'eip155:31337',amount:mode==='overpriced'?'99999999':amount,asset,payTo,maxTimeoutSeconds:60,extra:{name:'DemoUSDC',version:'1',assetTransferMethod:'eip3009'}});
 const server=await localServer(async(req,json,base)=>{
  const path=new URL(req.url,base).pathname;
  if(req.method==='GET'&&path==='/health')return json(200,{status:'ok'});
  if(req.method==='GET'&&path==='/stats')return json(200,{results:journal.rows('reports').map(r=>({requestHash:r.requestHash,paymentId:r.paymentId,nonce:r.nonce,settlement:r.settlement,outputHash:r.report.terms.outputHash}))});
  if(req.method==='POST'&&path==='/testing'){const b=await readJson(req);if(!['healthy','wrong-result','wrong-signature','repeat-402','lost-response','outage','overpriced'].includes(b.mode))return json(400,{});mode=b.mode;return json(200,{mode});}
  if(req.method!=='POST'||path!=='/v1/treasury-report')return json(404,{});
  const request=await checkX402ReportRequest(await readJson(req)),resource={url:base+path,description:'Deterministic treasury allocation report',mimeType:'application/json'};
  if(mode==='outage')return json(503,{error:'Reference report service unavailable.'});
  if(!req.headers['payment-signature']||mode==='repeat-402'){const required={x402Version:2,resource,accepts:[requirements()],extensions:{'payment-identifier':declarePaymentIdentifierExtension(true)}};return json(402,required,{'PAYMENT-REQUIRED':encodePaymentRequiredHeader(required)});}
  const payload=decodePaymentSignatureHeader(req.headers['payment-signature']),r=requirements(),a=await checkPayloadSignature(payload,r),paymentId=extractPaymentIdentifier(payload);
  if(!paymentId||payload.resource?.url!==resource.url)return json(400,{});
  const requestHash=await digest(request),payloadHash=await digest(payload),key=a.from.toLowerCase()+':'+paymentId,nonceKey=a.from.toLowerCase()+':'+a.nonce;
  const operation=async()=>{
   let row=journal.get('reports',key);const bound=journal.get('nonces',nonceKey);
   if(row&&(row.requestHash!==requestHash||row.payloadHash!==payloadHash)||bound&&bound!==key)throw Object.assign(Error('Conflicting paid request.'),{status:409});
   if(!row){
    const output=computeReport(request.input);if(mode==='wrong-result'){const keys=Object.keys(output.allocations);if(keys.length>1){output.allocations[keys[0]]++;output.allocations[keys[1]]--;}else output.allocations[keys[0]]++;}
    const terms={version:'agentos.x402-report.v1',jobId:request.jobId,inputHash:request.inputHash,paymentId,payer:a.from.toLowerCase(),nonce:a.nonce,output,outputHash:await digest(output),issuedAt:new Date().toISOString()};
    row={requestHash,payloadHash,paymentId,nonce:a.nonce,report:{terms,signature:await account.signMessage({message:reportMessage(terms)})}};
    journal.transaction(()=>{journal.put('reports',key,row);journal.put('nonces',nonceKey,key);});
   }
   if(!row.settlement){
    // The prepared result survives a crash after payment but before the HTTP response.
    const settlement=await jsonCall(facilitatorOrigin+'/settle',{paymentPayload:payload,paymentRequirements:r});
    if(!settlement.success)throw Error('x402 payment not settled.');row={...row,settlement};journal.put('reports',key,row);
   }
   return row;
  };
  if(!locks.has(key))locks.set(key,operation().finally(()=>locks.delete(key)));
  const row=await locks.get(key);
  if(mode==='lost-response'){mode='healthy';req.socket.destroy();return;}
  const delivered=mode==='wrong-signature'?{...row.report,signature:await account.signMessage({message:'Deliberately invalid upstream report signature'})}:row.report;
  return json(200,delivered,{'PAYMENT-RESPONSE':encodePaymentResponseHeader(row.settlement)});
 },port);
 return {...server,requirements,close:async()=>{await server.close();await Promise.allSettled([...locks.values()]);journal.close();}};
}
