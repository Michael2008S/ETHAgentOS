import {mixedSuccessors} from './mixed-lineage.ts';
import {verifyMixed} from './mixed-workflow.ts';
import {digest,DomainError} from './engine.ts';
import {findMonitor,verifyMonitor,type USDCMonitor} from './usdc-monitor-state.ts';
import type {Workspace} from './types.ts';
export const renewalSnapshot=(m:USDCMonitor)=>digest({termsHash:m.termsHash,status:m.status,cursor:m.cursor,anchor:m.anchor??null,reports:m.reports.map(r=>({workflowId:r.workflowId,sourceHash:r.sourceHash,status:r.status}))});
export async function monitorRenewalPreview(state:Workspace,id:string){const m=findMonitor(state,id);await verifyMonitor(m);if(!['completed','expired','stopped','failed'].includes(m.status)||m.renewedBy||m.reports.some(r=>r.status==='active'))throw new DomainError('Stop and reconcile the old monitor before renewal.','FORBIDDEN');for(const report of m.reports.filter(r=>r.status==='failed')){const lineage=mixedSuccessors(state,report.workflowId);for(const flow of lineage)await verifyMixed(flow);if(lineage.length>1||lineage.some(f=>f.steps.some(s=>s.status==='paid')))throw new DomainError('Resolve and reconcile the report repair lineage before renewing.','FORBIDDEN');}return {sourceId:m.id,snapshotHash:await renewalSnapshot(m),cursor:m.cursor,account:m.draft.account,buyer:m.draft.buyer,anchor:m.anchor};}
