import {businessAlerts} from './business-alerts.ts';
import {activeHistory,isArchived} from './business-archives.ts';
import {monitorRenewalPreview} from './usdc-monitor-renewal.ts';
import {digest,DomainError} from './engine.ts';
import {canonical} from '../../cre/workflow/verify.ts';
import {pluginGrant,pluginInstallation} from './plugin-store.ts';
import {pluginVaultAllowance,vaultAllowance,assertVaultSeller} from './vault.ts';
import {pluginPurchaseDailyExposure} from './plugin-purchase-store.ts';
import {futurePurchaseReservations} from './purchase-reservations.ts';
import {pendingPluginPurchaseSlots} from './plugin-purchase-protocol.ts';
import {mixedPluginRuns} from './mixed-workflow.ts';
import {treasuryPolicyManifest} from './mixed-wizard.ts';
import {monitorTerms,findMonitor,futureMonitorTickets,usdcMonitorDraftSchema,type USDCMonitor,type USDCMonitorDraft} from './usdc-monitor-state.ts';
import type {Workspace} from './types.ts';
import type {MixedStore,MixedCreationContext} from './mixed-workflow-store.ts';
export async function monitorPermission(store:MixedStore,owner:string,state:Workspace,m:USDCMonitor,c:MixedCreationContext,now=new Date().toISOString()){
 if(c.plugins.deployment.mode!=='local'||canonical(m.deployment)!==canonical(c.plugins.deployment)||!state.policy.active||m.expiresAt<=now)throw new DomainError('USDC monitor permission, deployment or deadline changed.','FORBIDDEN');
 for(const s of m.services)if(!c.catalog.some(current=>current.id===s.id&&current.digest===s.digest)||s.priceCents>state.policy.maxTaskBudget)throw new DomainError('A frozen monitor service or its price changed.','FORBIDDEN');
 const plugin=m.services[1],g=await pluginGrant(store.database,owner,plugin.binding.pluginId!);if(!g?.enabled||g.epoch!==m.grantEpoch||g.expiresAt<=now||g.manifestHash!==plugin.binding.manifestHash||g.runtimeHash!==plugin.binding.runtimeHash||g.used+mixedPluginRuns(state,plugin.binding.pluginId)>g.maxRuns)throw new DomainError('The original USDC monitor plugin grant changed.','FORBIDDEN');
 const session=pluginVaultAllowance(state,m.draft.vaultSessionId,m.draft.buyer as `0x${string}`,{pluginId:plugin.binding.pluginId!,manifestHash:plugin.binding.manifestHash!,runtimeHash:plugin.binding.runtimeHash!,maxPriceCents:plugin.priceCents},plugin.priceCents,0,now);
 vaultAllowance(state,m.draft.vaultSessionId,m.draft.buyer as `0x${string}`,'treasury-report',m.services[0].priceCents,0,now);assertVaultSeller(session,m.deployment.seller);if(session.scope!==m.scope)throw new DomainError('USDC monitor session scope differs.','FORBIDDEN');return session;
}
export async function createUSDCMonitor(store:MixedStore,owner:string,raw:USDCMonitorDraft,getContext:()=>Promise<MixedCreationContext>,now=new Date().toISOString()){
 const draft=usdcMonitorDraftSchema.parse(raw),id='usdc-monitor-'+draft.requestId,draftHash=await digest(draft);let context:Promise<MixedCreationContext>|undefined;
 const snapshot=await store.updateWorkspace(owner,async state=>{
  const prior=state.usdcMonitors?.find(m=>m.id===id);if(prior){if(prior.draftHash!==draftHash)throw new DomainError('Monitor identifier has different parameters.','IDEMPOTENCY_CONFLICT');return state;}
  if(draft.followup){const alert=(await businessAlerts(state)).find(a=>a.id===draft.followup!.alertId);if(!draft.renewal||!alert||alert.evidenceHash!==draft.followup.evidenceHash||alert.review?.id!==draft.followup.reviewId||alert.review.evidenceHash!==alert.evidenceHash||!alert.observations.some(o=>o.monitorId===draft.renewal!.sourceId))throw new DomainError('Follow-up alert or reviewed evidence changed. Review it again.','CONFLICT');}const renewal=draft.renewal?await monitorRenewalPreview(state,draft.renewal.sourceId):undefined;if(renewal&&(renewal.snapshotHash!==draft.renewal!.snapshotHash||draft.startBlock!==renewal.cursor||draft.account.toLowerCase()!==renewal.account.toLowerCase()||draft.buyer.toLowerCase()!==renewal.buyer.toLowerCase()))throw new DomainError('Renewal cursor, account or source changed.','FORBIDDEN');const c=await(context??=getContext()),selected=draft.services.map(ref=>c.catalog.find(s=>s.id===ref.id&&s.digest===ref.digest));const [skill,plugin]=selected;
  const installed=plugin&&await pluginInstallation(store.database,owner,plugin.id),expected=treasuryPolicyManifest(draft.thresholdBps);
  if(!skill||skill.executor!=='builtin'||skill.binding.skill!=='treasury-report'||!plugin||plugin.executor!=='plugin'||plugin.id!==expected.id||!installed||canonical(installed.manifest)!==canonical(expected))throw new DomainError('Review the exact treasury skill and concentration policy versions.','FORBIDDEN');
  const services=[skill,plugin] as USDCMonitor['services'],fee=services.reduce((n,s)=>n+s.priceCents,0),total=fee*draft.maxReports,g=await pluginGrant(store.database,owner,plugin.id),scope=await digest({workspace:owner}),session=state.vaultSessions?.find(s=>s.sessionId===draft.vaultSessionId);
  if(!g||!session||fee>draft.perReportBudget||total>draft.totalBudget)throw new DomainError('Monitor reports exceed the reviewed grants or budget.','FORBIDDEN');
  if((state.usdcMonitors?.length??0)>=100)throw new DomainError('Total retained monitor capacity reached.');if(activeHistory(state,'monitor',state.usdcMonitors??[]).length>=10||activeHistory(state,'mixed',state.mixedWorkflows??[]).length+futureMonitorTickets(state,now).length+draft.maxReports>20||activeHistory(state,'plugin-purchase',state.pluginPurchases??[]).length+mixedPluginRuns(state)+draft.maxReports>20||(state.pluginJobs?.length??0)+pendingPluginPurchaseSlots(state)+mixedPluginRuns(state)+draft.maxReports>100||(state.chainOrders?.length??0)+futurePurchaseReservations(state,now).length+draft.maxReports*2>300)throw new DomainError('Monitor exceeds reserved execution history capacity.','FORBIDDEN');
  if(pluginPurchaseDailyExposure(state,c.plugins.deployment,now)+total>state.policy.dailyBudget)throw new DomainError('Monitor exceeds the shared daily budget.','FORBIDDEN');
  const expiresAt=new Date(Math.min(Date.parse(now)+draft.durationSeconds*1000,Number(session.expires)*1000,Date.parse(g.expiresAt))).toISOString();if(Date.parse(expiresAt)-Date.parse(now)<120000)throw new DomainError('Monitor needs at least two minutes of remaining permission.','FORBIDDEN');
  const m:USDCMonitor={version:'agentos.usdc-monitor.v1',id,scope,draft,draftHash,termsHash:'',services,deployment:c.plugins.deployment,grantEpoch:g.epoch,fee,expiresAt,createdAt:now,updatedAt:now,status:'running',cursor:draft.startBlock,...(renewal?.anchor?{anchor:renewal.anchor}:{}),reports:[],emptyWindows:0};m.termsHash=await digest(monitorTerms(m));const next={...state,usdcMonitors:[m,...(state.usdcMonitors??[]).map(old=>old.id===renewal?.sourceId?{...old,renewedBy:id}:old)]};
  const permitted=await monitorPermission(store,owner,next,m,c,now);await c.plugins.checkSession(permitted,total);return next;
 });return findMonitor(snapshot.state,id);
}
