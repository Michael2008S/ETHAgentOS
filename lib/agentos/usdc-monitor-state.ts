import {z} from 'zod';
import {canonical} from '../../cre/workflow/verify.ts';
import {digest,DomainError} from './engine.ts';
import type {ServiceDescriptor} from './service-catalog.ts';
import type {Workspace} from './types.ts';
import type {MixedWorkflowDraft} from './mixed-workflow.ts';
import type {WalletDeployment} from '../../sdk/wallet.ts';
const money=z.number().int().positive().max(1000000);
export const usdcMonitorDraftSchema=z.object({requestId:z.string().uuid(),renewal:z.object({sourceId:z.string().regex(/^usdc-monitor-[0-9a-f-]{36}$/),snapshotHash:z.string().regex(/^0x[0-9a-f]{64}$/)}).strict().optional(),title:z.string().trim().min(1).max(120),buyer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),vaultSessionId:z.string().uuid(),account:z.string().regex(/^0x[0-9a-fA-F]{40}$/),startBlock:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),windowBlocks:z.number().int().min(1).max(100).default(10),pollSeconds:z.number().int().min(5).max(300).default(30),thresholdBps:z.number().int().min(1).max(10000).default(5000),maxReports:z.number().int().min(1).max(5).default(2),totalBudget:money,perReportBudget:money,durationSeconds:z.number().int().min(60).max(86400).default(3600),services:z.tuple([z.object({id:z.string().min(1).max(200),digest:z.string().regex(/^0x[0-9a-f]{64}$/)}).strict(),z.object({id:z.string().min(1).max(200),digest:z.string().regex(/^0x[0-9a-f]{64}$/)}).strict()])}).strict();
export type USDCMonitorDraft=z.infer<typeof usdcMonitorDraftSchema>;
export type USDCMonitorReport={from:number;to:number;endHash:string;requestId:string;workflowId:string;repairWorkflowId?:string;sourceHash:string;status:'active'|'completed'|'failed';output?:import('./plugin-protocol.ts').Json;error?:string};
export type USDCMonitor={version:'agentos.usdc-monitor.v1';id:string;scope:string;draft:USDCMonitorDraft;draftHash:string;termsHash:string;deployment:WalletDeployment;services:[ServiceDescriptor,ServiceDescriptor];grantEpoch:number;fee:number;expiresAt:string;createdAt:string;updatedAt:string;status:'running'|'paused'|'stopping'|'stopped'|'completed'|'failed'|'expired';renewedBy?:string;cursor:number;anchor?:{number:number;hash:string};reports:USDCMonitorReport[];pending?:{draft:MixedWorkflowDraft;from:number;to:number;endHash:string;sourceHash:string};lease?:{token:string;until:string};nextPollAt?:string;lastError?:string;emptyWindows:number;lastScanAt?:string;lastSuccessfulScanAt?:string;lastScanDurationMs?:number;finalizedHead?:number;sourceFailures?:number;sourceError?:string};
export const monitorTerms=(m:USDCMonitor)=>({version:m.version,id:m.id,scope:m.scope,draft:m.draft,draftHash:m.draftHash,deployment:m.deployment,services:m.services,grantEpoch:m.grantEpoch,fee:m.fee,expiresAt:m.expiresAt,createdAt:m.createdAt});
export async function verifyMonitor(m:USDCMonitor){if(m.version!=='agentos.usdc-monitor.v1'||await digest(monitorTerms(m))!==m.termsHash||await digest(m.draft)!==m.draftHash)throw new DomainError('USDC monitor terms changed.','CONFLICT');}
export function findMonitor(state:Workspace,id:string){const m=state.usdcMonitors?.find(m=>m.id===id);if(!m)throw new DomainError('USDC monitor not found.','NOT_FOUND');return m;}
export const publicMonitor=({lease:_,...m}:USDCMonitor)=>m;
export const pendingMonitors=(state:Workspace)=>(state.usdcMonitors??[]).filter(m=>['running','stopping','paused'].includes(m.status));
export function futureMonitorTickets(state:Workspace,now=new Date().toISOString()){
 return (state.usdcMonitors??[]).filter(m=>['running','paused'].includes(m.status)&&m.expiresAt>now).flatMap(m=>Array.from({length:Math.max(0,m.draft.maxReports-m.reports.length)},()=>m));
}
export const monitorReservations=(state:Workspace,now?:string)=>futureMonitorTickets(state,now).flatMap(m=>m.services.map(s=>({deployment:m.deployment,vaultSessionId:m.draft.vaultSessionId,quote:s.priceCents,budget:s.priceCents})));
export const monitorPluginRuns=(state:Workspace,id?:string)=>futureMonitorTickets(state).filter(m=>!id||m.services[1].binding.pluginId===id).length;
/** Creating a mixed child and consuming its reserved monitor ticket must share
 * the SAME workspace CAS. A response loss cannot release or duplicate a ticket. */
export function handoffMonitor(state:Workspace,reference:{id:string;token:string},draft:MixedWorkflowDraft){
 const next=structuredClone(state),m=findMonitor(next,reference.id),pending=m.pending;if(m.status!=='running'||m.expiresAt<=new Date().toISOString()||m.lease?.token!==reference.token||m.lease.until<=new Date().toISOString()||!pending||canonical(pending.draft)!==canonical(draft))throw new DomainError('USDC monitor handoff permission or lease changed.','FORBIDDEN');
 if(m.reports.some(r=>r.workflowId==='mixed-'+draft.requestId)||m.reports.length>=m.draft.maxReports)throw new DomainError('USDC monitor report ticket was already consumed.','CONFLICT');m.reports.push({from:pending.from,to:pending.to,endHash:pending.endHash,sourceHash:pending.sourceHash,requestId:draft.requestId,workflowId:'mixed-'+draft.requestId,status:'active'});delete m.pending;return next;
}
export function controlMonitor(state:Workspace,id:string,action:'pause'|'resume'|'stop',now=new Date().toISOString()){
 const next=structuredClone(state),m=findMonitor(next,id);if(['stopped','completed','failed','expired'].includes(m.status))return state;if(action!=='stop'&&!['running','paused'].includes(m.status))throw new DomainError('This USDC monitor is stopping.','FORBIDDEN');if(action==='resume'&&(m.status!=='paused'||m.expiresAt<=now))throw new DomainError('This USDC monitor cannot resume under its original limits.','FORBIDDEN');m.status=action==='pause'?'paused':action==='resume'?'running':'stopping';delete m.lease;m.updatedAt=now;m.nextPollAt=now;if(action==='stop'){m.lastError='Stopped by owner.';delete m.pending;for(const report of m.reports.filter(r=>r.status==='active')){const flow=next.mixedWorkflows?.find(f=>f.id===report.workflowId);if(flow&&['running','cancelling'].includes(flow.status)){flow.status='cancelling';flow.lastError='Mixed workflow cancelled by its owner.';delete flow.lease;for(const step of flow.steps)if(!step.childId)step.status='cancelled';}}}return next;
}
