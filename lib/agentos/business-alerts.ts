import {digest,DomainError} from './engine.ts';import type {Workspace} from './types.ts';
export type AlertReview={id:string;alertId:string;evidenceHash:string;previousId:string|null;decision:'acknowledged'|'resolved'|'dismissed';comment:string;at:string};
export async function businessAlerts(state:Workspace){
 const groups=new Map<string,{account:string;recipient:string;thresholdBps:number;observations:{monitorId:string;workflowId:string;sourceHash:string;from:number;to:number}[]}>();
 for(const m of state.usdcMonitors??[])for(const r of m.reports){
  const output=r.output as {reviewRequired?:boolean;topRecipient?:string}|undefined;if(r.status!=='completed'||!output?.reviewRequired||!output.topRecipient)continue;
  const key=await digest({kind:'usdc-concentration',account:m.draft.account.toLowerCase(),recipient:output.topRecipient.toLowerCase(),thresholdBps:m.draft.thresholdBps});
  const group=groups.get(key)??{account:m.draft.account,recipient:output.topRecipient,thresholdBps:m.draft.thresholdBps,observations:[]};
  if(!group.observations.some(o=>o.sourceHash===r.sourceHash))group.observations.push({monitorId:m.id,workflowId:r.repairWorkflowId??r.workflowId,sourceHash:r.sourceHash,from:r.from,to:r.to});groups.set(key,group);
 }
 return Promise.all([...groups].map(async([id,g])=>{g.observations.sort((a,b)=>a.from-b.from||a.sourceHash.localeCompare(b.sourceHash));const evidenceHash=await digest(g),review=state.businessAlertReviews?.find(r=>r.alertId===id),current=review?.evidenceHash===evidenceHash;return {id,...g,evidenceHash,review,status:current&&review.decision!=='acknowledged'?review.decision:review&&!current?'reopened':'open'};}));
}
export async function reviewBusinessAlert(state:Workspace,input:Omit<AlertReview,'at'>){
 const alert=(await businessAlerts(state)).find(a=>a.id===input.alertId);if(!alert||alert.evidenceHash!==input.evidenceHash)throw new DomainError('Alert evidence changed. Refresh before reviewing.','CONFLICT');
 const existing=state.businessAlertReviews?.find(r=>r.id===input.id);if(existing){const {at:_,...body}=existing;if(await digest(body)!==await digest(input))throw new DomainError('Alert review identifier changed.','IDEMPOTENCY_CONFLICT');return state;}
 if((alert.review?.id??null)!==input.previousId)throw new DomainError('Alert disposition changed. Refresh.','CONFLICT');if((state.businessAlertReviews?.length??0)>=200)throw new DomainError('Alert review history full. Export before extending retention.');
 return {...state,businessAlertReviews:[{...input,at:new Date().toISOString()},...state.businessAlertReviews??[]]};
}
