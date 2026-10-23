import {readDataFeedSnapshot,gasUsdMicros} from '../../lib/agentos/data-feeds.ts';
import {digest} from '../../lib/agentos/engine.ts';
import {supplierJobId} from '../../lib/agentos/supplier.ts';
import {x402Revision} from '../../lib/agentos/x402-policy.ts';
import {x402EvidenceMessage} from '../../lib/agentos/x402-evidence.ts';
import {procurementClient} from './client.mjs';
import {jsonCall} from './http.mjs';

export async function x402Fulfillment({policy,account,client,store,appOrigin,authorize:customAuthorize,afterPersist,afterPayment}){
 const authorize=customAuthorize??(async(ticket,body)=>{
  try{return await jsonCall(appOrigin+'/api/runtime/x402-authorize',body,{'x-agentos-x402-ticket':ticket});}
  catch(error){if([400,403,409].includes(error.status))error.terminal=true;throw error;}
 });
 const guard=async()=>{if(policy.dataFeeds?.riskEnabled){try{await readDataFeedSnapshot(client,policy.dataFeeds);}catch(error){error.terminal=true;throw error;}}};
 const procurement=procurementClient({policy,account,client,store,authorize,afterPersist,afterPayment,beforePurchase:guard});
 return {policy,async feedStatus(){try{const snapshot=await this.quoteSnapshot();return {status:policy.dataFeeds?(snapshot?'ok':'unavailable'):'disabled',mode:'local-mock',snapshot};}catch(error){return {status:'blocked',mode:'local-mock',error:error.message};}},async quoteSnapshot(){if(!policy.dataFeeds)return undefined;try{return await readDataFeedSnapshot(client,policy.dataFeeds);}catch(error){if(policy.dataFeeds.riskEnabled){error.terminal=true;throw error;}return undefined;}},revision:await x402Revision(policy),procurement,
  async observe(request,ticket){
   if(!request.quote||request.skill!=='treasury-report'||!/^x402_[0-9a-f]{64}$/.test(ticket??''))throw Object.assign(Error('Reviewed x402 quote and execution ticket required.'),{status:403});
   const jobId=supplierJobId(request),requestHash=await digest(request),prior=store.get('supplier-context',jobId);
   if(prior&&prior.requestHash!==requestHash)throw Object.assign(Error('Conflicting supplier request.'),{status:409});
   await authorize(ticket,{action:'preflight',jobId});
   store.put('supplier-context',jobId,{scope:request.quote.payload.request.workspaceHash,orderId:request.orderId,jobId,requestHash,inputHash:request.inputHash,priceSnapshot:request.quote.payload.priceSnapshot,configHash:request.supplier.configHash,ticketHash:await digest(ticket)});
  },
  async execute(request,ticket){
   const body={version:'agentos.x402-report-request.v1',jobId:supplierJobId(request),inputHash:request.inputHash,input:request.input};
   try{return (await procurement.execute(body,ticket)).report.terms.output;}
   catch(error){if(error.code==='SUPPLIER_REJECTED'||error.name==='ZodError')error.terminal=true;throw error;}
  },
  async evidence(body,ticket,_descriptor,signer){
   const context=store.get('supplier-context',body.jobId);
   if(!context||context.ticketHash!==await digest(ticket??'')||context.requestHash!==body.requestHash)throw Object.assign(Error('Scoped evidence access refused.'),{status:403});
   const row=await procurement.reconcile(body.jobId);let gas;
   if(row?.payment&&context.priceSnapshot){const receipt=await client.getTransactionReceipt({hash:row.payment.transaction}),cost=receipt.gasUsed*receipt.effectiveGasPrice;gas={gasUsed:String(receipt.gasUsed),effectiveGasPriceWei:String(receipt.effectiveGasPrice),costWei:String(cost),usdMicros:String(gasUsdMicros(cost,context.priceSnapshot.ethUsd))};}
   const terms={version:'agentos.x402-procurement-evidence.v1',scope:context.scope,orderId:context.orderId,jobId:context.jobId,requestHash:context.requestHash,inputHash:context.inputHash,configHash:context.configHash,policyHash:await digest(policy),state:row?.state??'rejected',amount:row?.amount??'0',payer:account.address.toLowerCase(),asset:policy.asset,payTo:policy.payTo,...(row?.paymentId?{paymentId:row.paymentId}:{}),...(row?.payload?{nonce:row.payload.payload.authorization.nonce}:{}),...(row?.payment?{payment:row.payment}:{}),...(row?.report?{report:row.report}:{}),...(gas?{gas}:{}),issuedAt:new Date().toISOString()};
   return {terms,signature:await signer.signMessage({message:x402EvidenceMessage(terms)})};
  },
 };
}
