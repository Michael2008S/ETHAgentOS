import {canonical,resultHash} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import {pluginJob,pluginInstallation,type PluginDatabase} from './plugin-store.ts';
import {pluginExecutionRequest} from './plugin-state.ts';
import {verifyPluginExecution} from './plugin-protocol.ts';
import {pluginPurchaseTerms,type PluginPurchaseWorkflow,type PluginPaidRoot} from './plugin-purchase-protocol.ts';
import type {PluginPurchaseChain} from './plugin-purchase-chain.ts';
export async function readPluginFlow(store:PluginDatabase,owner:string,id:string):Promise<PluginPurchaseWorkflow>{
 const row=await store.database.prepare('SELECT data FROM agentos_plugin_purchases WHERE owner_id=? AND id=?').bind(owner,id).first<{data:string}>();if(!row)throw new DomainError('Plugin purchase workflow not found.','NOT_FOUND');const f=JSON.parse(row.data) as PluginPurchaseWorkflow;
 if(f.termsHash!==await digest(pluginPurchaseTerms(f)))throw new DomainError('Stored plugin purchase terms differ.','CONFLICT');return f;
}
export async function canonicalPluginPaidRoot(store:PluginDatabase,owner:string,root:PluginPaidRoot,chain:PluginPurchaseChain,buyer:string){
 const flow=await readPluginFlow(store,owner,root.workflowId),scope=(await store.read(owner)).scope,step=flow.steps[root.step];
 if(flow.scope!==scope||flow.buyer.toLowerCase()!==buyer.toLowerCase()||canonical(flow.deployment)!==canonical(chain.deployment)||step?.status!=='paid'||step.taskId!==root.taskId||step.settlement?.status!=='paid'||step.settlement.transactionHash!==root.settlementTransactionHash||!step.funding)throw new DomainError('Paid plugin memory belongs to another buyer, deployment or payment.','FORBIDDEN');
 const job=await pluginJob(store.database,owner,step.jobId),installed=await pluginInstallation(store.database,owner,step.pluginId);
 if(!installed||installed.manifestHash!==step.manifestHash||job.status!=='completed'||!job.execution||job.scope!==flow.scope||job.purchase?.workflowId!==flow.id||job.purchase.step!==step.index||job.inputHash!==step.inputHash||job.execution.digest!==root.executionDigest)throw new DomainError('Paid plugin memory has no matching signed delivery.','FORBIDDEN');
 await verifyPluginExecution(job.execution,{...pluginExecutionRequest(job,installed),runtimeSigner:flow.runtime.deliverySigner});
 await chain.funding(flow,step,step.funding.transactionHash);const settlement=await chain.settlement(flow,step,root.settlementTransactionHash);
 if(settlement.status!=='paid'||settlement.outputHash!==resultHash(job.execution)||step.outputHash!==settlement.outputHash)throw new DomainError('Paid plugin memory payment is no longer canonical.','CONFLICT');
 return {flow,step,execution:job.execution,settlement};
}
