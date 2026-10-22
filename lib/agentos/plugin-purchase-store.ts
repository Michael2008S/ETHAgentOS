import {digest,DomainError} from './engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {mutatePlugin,pluginInstallation,pluginGrant,type PluginDatabase, type PluginSnapshot} from './plugin-store.ts';
import {pluginToolsAvailable} from './plugin-state.ts';
import {validatePluginValue,type PluginRuntimeDescriptor} from './plugin-protocol.ts';
import {pluginPurchaseRequestSchema,pluginPurchaseRef,pluginPurchaseTaskId,pluginStepRequestId,pluginPurchaseTerms,pendingPluginPurchaseSlots,selectPluginPurchaseInput,type PluginPurchaseDraft,type PluginPurchaseWorkflow} from './plugin-purchase-protocol.ts';
import {pluginVaultAllowance,sessionBinding,type VaultSession} from './vault.ts';
import {futurePurchaseReservations} from './purchase-reservations.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
import type {Workspace} from './types.ts';
type Guard={sql:string;values:unknown[]};
export type PluginPurchaseContext={runtime:PluginRuntimeDescriptor;deployment:WalletDeployment;priceCents:number;checkSession:(session:VaultSession,gross:number)=>Promise<unknown>};
export async function pluginPurchase(store:PluginDatabase,owner:string,id:string):Promise<PluginPurchaseWorkflow>{const row=await store.database.prepare('SELECT data FROM agentos_plugin_purchases WHERE owner_id=? AND id=?').bind(owner,id).first<{data:string}>();if(!row)throw new DomainError('Plugin purchase workflow not found.','NOT_FOUND');return JSON.parse(row.data);}
const refState=(state:Workspace,flow:PluginPurchaseWorkflow):Workspace=>({...state,pluginPurchases:[...(state.pluginPurchases??[]).filter(f=>f.id!==flow.id),pluginPurchaseRef(flow)]});
const write=(store:PluginDatabase,owner:string,flow:PluginPurchaseWorkflow,g:Guard)=>store.database.prepare('INSERT INTO agentos_plugin_purchases(owner_id,id,workspace_hash,data,created_at) SELECT ?,?,?,?,? WHERE '+g.sql+' ON CONFLICT(owner_id,id) DO UPDATE SET data=excluded.data').bind(owner,flow.id,flow.scope,JSON.stringify(flow),Date.parse(flow.createdAt),...g.values);
export function pluginPurchaseDailyExposure(state:Workspace,deployment:WalletDeployment,now:string){
 const matches=(d:WalletDeployment)=>d.chainId===deployment.chainId&&d.token.toLowerCase()===deployment.token.toLowerCase();
 const used=(state.chainOrders??[]).filter(o=>matches(o.deployment)&&(o.funding||o.vault&&o.status==='funding')).reduce((n,o)=>n+(o.settlement?.status==='paid'?(o.settledAt?.slice(0,10)===now.slice(0,10)?o.quote:0):!o.settlement?o.budget:0),0);
 return used+futurePurchaseReservations(state,now).filter(r=>matches(r.deployment)).reduce((n,r)=>n+r.budget,0);
}
export async function createPluginPurchase(store:PluginDatabase,owner:string,raw:PluginPurchaseDraft,getContext:()=>Promise<PluginPurchaseContext>,now=new Date().toISOString()){
 const body=pluginPurchaseRequestSchema.parse(raw),draftHash=await digest(body),id='plugin-purchase-'+body.requestId;let context:Promise<PluginPurchaseContext>|undefined;
 return mutatePlugin(store,owner,async s=>{
  const prior=await store.database.prepare('SELECT data FROM agentos_plugin_purchases WHERE owner_id=? AND id=?').bind(owner,id).first<{data:string}>();
  if(prior){const flow=JSON.parse(prior.data) as PluginPurchaseWorkflow;if(flow.draftHash!==draftHash)throw new DomainError('Plugin purchase identifier already has different parameters.','IDEMPOTENCY_CONFLICT');return {state:s.state,value:flow};}
  const c=await(context??=getContext());
  if(!s.state.policy.active||!Number.isSafeInteger(c.priceCents)||c.priceCents<1||c.priceCents>1000000||!c.runtime.deliverySigner)throw new DomainError('Authenticated paid plugin execution is unavailable.','FORBIDDEN');
  const {configHash,...terms}=c.runtime;if(await digest(terms)!==configHash)throw new DomainError('Plugin runtime commitment differs.','FORBIDDEN');
  if((s.state.pluginPurchases?.length??0)>=20||(s.state.pluginJobs?.length??0)+pendingPluginPurchaseSlots(s.state)+body.steps.length>100)throw new DomainError('Plugin purchase or reserved job history limit reached.');
  const total=c.priceCents*body.steps.length;if(total>body.totalBudget||body.steps.some(p=>c.priceCents>p.maxPriceCents||p.maxPriceCents>s.state.policy.maxTaskBudget))throw new DomainError('Plugin quotes exceed the reviewed fees or per-task policy.','FORBIDDEN');
  if(pluginPurchaseDailyExposure(s.state,c.deployment,now)+total>s.state.policy.dailyBudget)throw new DomainError('Plugin workflow exceeds the shared daily budget.','FORBIDDEN');
  const grants=new Map<string,NonNullable<Awaited<ReturnType<typeof pluginGrant>>>>(),steps:PluginPurchaseWorkflow['steps']=[];let session:VaultSession|undefined,minExpiry=Infinity,requiredMs=20000;
  for(const [index,step]of body.steps.entries()){
   const installed=await pluginInstallation(store.database,owner,step.pluginId),grant=grants.get(step.pluginId)??await pluginGrant(store.database,owner,step.pluginId);
   if(!installed||installed.manifestHash!==step.manifestHash||c.runtime.configHash!==step.runtimeHash||!grant?.enabled||grant.manifestHash!==step.manifestHash||grant.runtimeHash!==step.runtimeHash||grant.expiresAt<=now||grant.used>=grant.maxRuns)throw new DomainError('An available exact plugin execution grant is required.','FORBIDDEN');
   pluginToolsAvailable(installed.manifest,c.runtime);session=pluginVaultAllowance(s.state,body.vaultSessionId,body.buyer as `0x${string}`,step,step.maxPriceCents,total,now);
   if(session.scope!==s.scope)throw new DomainError('Vault plugin session belongs to another workspace.','FORBIDDEN');
   minExpiry=Math.min(minExpiry,Date.parse(grant.expiresAt),Number(session.expires)*1000);requiredMs+=2*installed.manifest.limits.wallMs;
   if(step.input.from==='root')validatePluginValue(installed.manifest.input,selectPluginPurchaseInput(body.input,step.input,new Map()));
   const taskId=await pluginPurchaseTaskId(s.scope,body.requestId,index),requestId=pluginStepRequestId(taskId),jobId='plugin-job-'+requestId;
   if(s.state.pluginJobs?.some(j=>j.id===jobId))throw new DomainError('A plugin purchase job identifier is already used.','IDEMPOTENCY_CONFLICT');
   steps.push({index,requestId,jobId,pluginId:step.pluginId,manifestHash:step.manifestHash,runtimeHash:step.runtimeHash,grantEpoch:grant.epoch,priceCents:c.priceCents,input:step.input,status:'pending',taskId});
   grants.set(step.pluginId,{...grant,used:grant.used+1});
  }
  const deadlineAt=new Date(Math.min(Date.parse(now)+body.timeoutSeconds*1000,minExpiry)).toISOString();
  if(Date.parse(deadlineAt)-Date.parse(now)<requiredMs)throw new DomainError('Plugin permissions leave insufficient time for the bounded workflow.','FORBIDDEN');
  await c.checkSession(session!,total);
  const flow:PluginPurchaseWorkflow={version:'agentos.plugin-purchase.v1',id,requestId:body.requestId,scope:s.scope,draftHash,termsHash:'',title:body.title,buyer:body.buyer as `0x${string}`,vaultSessionId:body.vaultSessionId,deployment:c.deployment,runtime:c.runtime,vault:sessionBinding(session!),input:body.input,totalBudget:body.totalBudget,createdAt:now,deadlineAt,updatedAt:now,status:'running',steps};flow.termsHash=await digest(pluginPurchaseTerms(flow));
  return {state:refState(s.state,flow),value:flow,write:g=>[write(store,owner,flow,g),...Array.from(grants.values(),grant=>store.database.prepare('UPDATE agentos_plugin_grants SET data=? WHERE owner_id=? AND plugin_id=? AND '+g.sql).bind(JSON.stringify(grant),owner,grant.pluginId,...g.values))]};
 });
}
export async function changePluginPurchase<T>(store:PluginDatabase,owner:string,id:string,reduce:(snapshot:PluginSnapshot,flow:PluginPurchaseWorkflow)=>Promise<{flow:PluginPurchaseWorkflow;value:T}|{value:T}>){return mutatePlugin(store,owner,async s=>{const prior=await pluginPurchase(store,owner,id);if(prior.termsHash!==await digest(pluginPurchaseTerms(prior)))throw new DomainError('Stored plugin purchase terms differ.','CONFLICT');const originalTerms=canonical(pluginPurchaseTerms(prior)),originalHash=prior.termsHash;const result=await reduce(s,structuredClone(prior));if(!('flow'in result))return {state:s.state,value:result.value};if(result.flow.termsHash!==originalHash||canonical(pluginPurchaseTerms(result.flow))!==originalTerms)throw new DomainError('A running purchase cannot replace its reviewed terms.','CONFLICT');return {state:refState(s.state,result.flow),value:result.value,write:g=>[write(store,owner,result.flow,g)]};});}
export async function cancelPluginPurchase(store:PluginDatabase,owner:string,id:string,now=new Date().toISOString()){
 return changePluginPurchase(store,owner,id,async(_s,prior)=>{if(!['running','cancelling'].includes(prior.status))return {value:prior};const flow=structuredClone(prior);flow.status='cancelling';flow.stopReason='owner-cancelled';flow.updatedAt=now;for(const step of flow.steps)if(step.status==='pending'&&!step.fundingIntent)step.status='cancelled';delete flow.runLease;if(flow.steps.every(s=>['paid','refunded','cancelled'].includes(s.status)))flow.status='cancelled';return {flow,value:flow};});
}
