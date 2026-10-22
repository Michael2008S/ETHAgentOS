import {missionList,missionSelection} from './business-missions.ts';import {isArchived} from './business-archives.ts';import type {Workspace} from './types.ts';
export function businessOperations(input:Workspace){
 const state={...input,usdcMonitors:input.usdcMonitors?.map(m=>({...m,reports:m.reports.map(r=>{let id=r.repairWorkflowId??r.workflowId;const seen=new Set<string>();for(;;){const f=input.mixedWorkflows?.find(f=>f.id===id);if(!f?.repairedBy||seen.has(id))break;seen.add(id);id=f.repairedBy;}return id===r.workflowId?r:{...r,repairWorkflowId:id};})}))};
 const monitorChildren=new Set<string>();for(const m of state.usdcMonitors??[])for(const f of missionSelection(state,m.id).flows)monitorChildren.add(f.id);
 return missionList(state).filter(m=>!m.successor&&!isArchived(state,m.kind==='monitor'?'monitor':'mixed',m.id)&&(m.kind==='monitor'||!monitorChildren.has(m.id))).map(m=>{
  const selected=missionSelection(state,m.id),pending=selected.flows.filter(f=>f.status==='completed'&&!state.businessReviews?.some(r=>r.missionId===f.id)).length;
  const raw=m.kind==='monitor'?state.usdcMonitors!.find(x=>x.id===m.id)!:state.mixedWorkflows!.find(x=>x.id===m.id)!;
  let nextAction='inspect',targetId=m.id;
  if(['running','cancelling','paused','stopping'].includes(m.status))nextAction=m.status==='paused'?'resume':'watch';
  else if(m.kind==='monitor'){
   const report=state.usdcMonitors!.find(x=>x.id===m.id)!.reports.find(r=>r.status==='failed');
   if(report){let f=state.mixedWorkflows!.find(x=>x.id===report.workflowId)!;const seen=new Set<string>();while(f.repairedBy&&!seen.has(f.id)){seen.add(f.id);f=state.mixedWorkflows!.find(x=>x.id===f.repairedBy)!;}
    nextAction=f.status==='completed'?'adopt-repair':['failed','cancelled'].includes(f.status)?'repair':'watch';targetId=nextAction==='adopt-repair'?m.id:f.id;
   }else nextAction=pending?'review':'renew';
  }else if(['failed','cancelled'].includes(m.status))nextAction='repair';else if(pending)nextAction='review';
  if(nextAction==='review')targetId=selected.flows.find(f=>f.status==='completed'&&!state.businessReviews?.some(r=>r.missionId===f.id))?.id??m.id;
  return {...m,nextAction,targetId,pendingReviewCount:pending,lastError:raw.lastError??null};
 });
}
export function businessOperationCounts(state:Workspace){const rows=businessOperations(state);return {total:rows.length,running:rows.filter(r=>['running','paused','cancelling','stopping'].includes(r.status)).length,attention:rows.filter(r=>['repair','adopt-repair','review'].includes(r.nextAction)).length};}
