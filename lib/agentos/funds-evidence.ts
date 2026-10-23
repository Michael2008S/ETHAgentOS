import {futureMixed} from './mixed-workflow.ts';
import {futureMonitorTickets} from './usdc-monitor-state.ts';
import {futureWorkflowSteps} from './workflow-state.ts';
import {futureRouteOffers} from './purchase-route-state.ts';
import type {PluginPurchaseWorkflow} from './plugin-purchase-protocol.ts';
import type {Workspace} from './types.ts';
import type {X402Evidence} from './x402-evidence.ts';
import {wallet} from './engine.ts';
export type FundsRecord={id:string;pool:'escrow'|'ccip'|'supplier-token'|'supplier-gas'|'plugin-escrow'|'future-authorization';chainId:number;asset:string;status:string;amount:string|null;unit:'atomic'|'wei'|'cents';reserved:string|null;reference?:string;recordedAt?:string;reason:string};
/** A projection of owner-scoped checkpoints, never a cross-currency balance or a new settlement decision. */
export function fundsEvidence(state:Workspace,evidence:Record<string,X402Evidence|undefined>,pluginFlows:Record<string,PluginPurchaseWorkflow|undefined>={}){
 const records:FundsRecord[]=[];
 for(const order of state.chainOrders??[]){
  const settlement=order.settlement,funding=order.funding;
  records.push({id:order.id,pool:'escrow',chainId:order.deployment.chainId,asset:order.deployment.token,status:settlement?.status??(funding?'funded':order.vaultFunding?'funding-unknown':'not-funded'),amount:settlement?.amount??funding?.amount??null,unit:'atomic',reserved:settlement?'0':funding?.amount??null,reference:settlement?.transactionHash??funding?.transactionHash,recordedAt:order.updatedAt,reason:settlement?'Recorded canonical settlement':funding?'User principal remains in escrow':order.vaultFunding?'Funding intent unresolved; retain authorization':'No confirmed funding recorded'});
  if(!order.x402Review)continue;
  const e=evidence[order.id]?.terms,payment=e?.payment;
  records.push({id:order.id,pool:'supplier-token',chainId:order.deployment.chainId,asset:e?.asset??order.deployment.token,status:payment?'paid-recorded':e?.state??'unknown',amount:payment?.amount??null,unit:'atomic',reserved:payment?'0':e&&!['unpaid','rejected'].includes(e.state)?e.amount:null,reference:payment?.transaction,recordedAt:e?.issuedAt,reason:payment?'Supplier cost persists independently of user refund':'No confirmed supplier payment; exposure is unknown, not zero'});
  records.push({id:order.id,pool:'supplier-gas',chainId:order.deployment.chainId,asset:'native',status:e?.gas?'spent-recorded':'unknown',amount:e?.gas?.costWei??null,unit:'wei',reserved:e?.gas?'0':null,reference:payment?.transaction,recordedAt:e?.issuedAt,reason:e?.gas?'Recorded native gas cost; separate from token principal':'Native gas reservation is not available in this workspace checkpoint'});
 }
 for(const ref of state.pluginPurchases??[])ref.steps.forEach((step,index)=>{
  const full=pluginFlows[ref.id]?.steps[index],receipt=full?.settlement??full?.funding,terminal=['paid','refunded','cancelled'].includes(step.status);
  records.push({id:ref.id+':'+index,pool:'plugin-escrow',chainId:ref.deployment.chainId,asset:ref.deployment.token,status:step.status,amount:receipt?.amount??null,unit:receipt?'atomic':'cents',reserved:terminal?'0':receipt?.amount??String(step.priceCents),reference:receipt?.transactionHash,recordedAt:step.settledAt,reason:receipt?'Recorded plugin escrow checkpoint':'Plugin authorization retained separately from unconfirmed funding'});
 });
 const future=(id:string,deployment:{chainId:number;token:string},budget:number)=>records.push({id,pool:'future-authorization',chainId:deployment.chainId,asset:deployment.token,status:'reserved-for-future-step',amount:null,unit:'cents',reserved:String(budget),reason:'Future authorization only; handed-off children account for their own funds'});
 for(const {flow,step} of futureMixed(state))future(flow.id+':'+step.requestId,flow.deployment,step.maxPriceCents);
 for(const {workflow,step} of futureWorkflowSteps(state))future(workflow.id+':'+step.requestId,workflow.deployment,step.budget);
 futureRouteOffers(state).forEach(({route,offer},index)=>future(route.id+':offer:'+index,route.deployment,offer.supplierQuote.payload.priceCents));
 futureMonitorTickets(state).forEach((monitor,index)=>monitor.services.forEach((service,serviceIndex)=>future(monitor.id+':ticket:'+index+':service:'+serviceIndex,monitor.deployment,service.priceCents)));
 for(const job of state.ccipTasks??[])records.push({id:job.id,pool:'ccip',chainId:job.deployment.b.chainId,asset:job.deployment.b.token,status:job.status,amount:String(job.draft.budgetCents),unit:'cents',reserved:String(job.reservedCents),reference:job.chainTaskId,recordedAt:job.createdAt,reason:job.reservedCents?'Keep authorization reserved until result and ACK are confirmed':'Result and ACK confirmed; local authorization released'});
 return {sandbox:{...wallet(state),unit:'sandbox-cents' as const},records};
}
