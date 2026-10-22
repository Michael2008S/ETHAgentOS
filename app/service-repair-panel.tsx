'use client';
import {ClientScope} from './client-scope';
import type {ComponentProps} from 'react';
import {useEffect,useRef,useState} from 'react';
import {AgentServiceReplanClient} from '@/sdk/service-replans';
import type {PublicPluginPurchase} from '@/lib/agentos/plugin-purchase-protocol';
import type {ServiceProposal} from '@/lib/agentos/service-plans';
import type {ServiceReplanContext} from '@/lib/agentos/service-replan';
import {submissionIntent} from '@/lib/agentos/client-intent';
import {useLanguage} from '@/lib/i18n/context';
const cents=(s:string)=>/^\d+(\.\d{1,2})?$/.test(s)?Math.round(Number(s)*100):NaN;
function ServiceRepairPanelContent({scope,flow,disabled,onApply}:{scope:string;flow:PublicPluginPurchase;disabled:boolean;onApply:(p:ServiceProposal)=>void}){
 const price=flow.steps.at(-1)?.priceCents??100;
 const {tr}=useLanguage(),[goal,setGoal]=useState('Write the remaining report using the selected paid result. Do not repeat completed work.'),[goalBudget,setGoalBudget]=useState(()=>((flow.repair?.goalBudget??flow.totalBudget+price)/100).toFixed(2)),[planBudget,setPlanBudget]=useState(()=>(price/100).toFixed(2)),[perStep,setPerStep]=useState(()=>(price/100).toFixed(2)),[maxSteps,setMaxSteps]=useState(1),[root,setRoot]=useState(''),[context,setContext]=useState<ServiceReplanContext|null>(null),[choices,setChoices]=useState<ServiceReplanContext['rootChoices']>([]),[proposal,setProposal]=useState<ServiceProposal|null>(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0),lock=useRef(false),api=()=>new AgentServiceReplanClient(scope);
 useEffect(()=>{generation.current++;return()=>{generation.current++;};},[scope,flow.id]); // eslint-disable-line react-hooks/exhaustive-deps
 const repairKey=JSON.stringify([root,goal,goalBudget,planBudget,perStep,maxSteps]);
 const [previousRepairKey,setPreviousRepairKey]=useState(repairKey);
 if(previousRepairKey!==repairKey){setPreviousRepairKey(repairKey);setReviewed(false);setProposal(null);setContext(null);}
 function act(fn:(current:number)=>Promise<void>){if(disabled||lock.current)return;lock.current=true;setBusy(true);setError('');const current=generation.current;void fn(current).catch(reason=>{if(current===generation.current)setError(reason instanceof Error?reason.message:'Plugin repair unavailable.');}).finally(()=>{if(current===generation.current){lock.current=false;setBusy(false);}});}
 const eligible=['failed','cancelled'].includes(flow.status)&&!flow.supersededBy,off=disabled||busy||!eligible;
 function selection(){const [workflowId,index]=root.split('#');return {sourceWorkflowId:flow.id,buyer:flow.buyer,goalBudget:cents(goalBudget),root:root?{workflowId,step:Number(index)}:null};}
 return <section className="chain-proof" id="service-repair-panel"><h3>{tr('Repair unfinished plugin work')}</h3><p>{tr('Keep original paid results and receipts. All funded attempts, including refunds, count toward the cumulative goal budget. A replacement is purchased only after a separate review and current execution/payment grants.')}</p>
  {!eligible&&<p className="form-note">{tr('Finish cancellation and refunds before planning a repair. Completed or already replaced workflows cannot be repaired again.')}</p>}
  <label className="field">{tr('Remaining plugin goal')}<textarea name="serviceRepairGoal" value={goal} maxLength={500} rows={2} disabled={off} onChange={e=>setGoal(e.target.value)}/></label>
  <div className="form-grid"><label className="field">{tr('Gross goal budget · test tokens')}<input name="serviceRepairGoalBudget" type="number" min="0.01" step="0.01" value={goalBudget} disabled={off||Boolean(flow.repair)} onChange={e=>setGoalBudget(e.target.value)}/></label><label className="field">{tr('Remaining plan budget · test tokens')}<input name="serviceRepairPlanBudget" type="number" min="0.01" step="0.01" value={planBudget} disabled={off} onChange={e=>setPlanBudget(e.target.value)}/></label><label className="field">{tr('Maximum fee · test tokens')}<input name="serviceRepairPerStep" type="number" min="0.01" step="0.01" value={perStep} disabled={off} onChange={e=>setPerStep(e.target.value)}/></label><label className="field">{tr('Maximum planned plugin steps')}<input name="serviceRepairSteps" type="number" min={1} max={8} value={maxSteps} disabled={off} onChange={e=>setMaxSteps(Number(e.target.value))}/></label></div>
  <button type="button" className="btn secondary small" disabled={off} onClick={()=>act(async current=>{const c=await api().inspect(selection());if(current===generation.current){setContext(c);setChoices(c.rootChoices);}})}>{tr('Verify repair payments and available roots')}</button>
  <label className="field">{tr('Reviewed repair input')}<select name="serviceRepairRoot" value={root} disabled={off} onChange={e=>setRoot(e.target.value)}><option value="">{tr('Original goal input')}</option>{choices.map(c=><option key={c.taskId} value={c.workflowId+'#'+c.step}>{c.pluginId} · {c.workflowId} · {c.step+1}</option>)}</select></label>
  {context&&<details><summary>{tr('Verified cumulative repair context')}</summary><pre className="artifact-json">{JSON.stringify(context,null,2)}</pre></details>}
  <button type="button" className="btn secondary small" disabled={off||goal.trim().length<3} onClick={()=>act(async current=>{const payload={...selection(),parameters:{goal,totalBudget:cents(planBudget),perStepBudget:cents(perStep),maxSteps,timeoutSeconds:600}},intent=await submissionIntent(scope,'service-repair-plan',payload,sessionStorage),p=await api().propose(payload,{requestId:intent.id,...payload.parameters});intent.acknowledge();if(current===generation.current){setProposal(p);setReviewed(false);}})}>{tr('Generate or retry plugin repair plan')}</button>
  {proposal&&<><pre className="artifact-json">{JSON.stringify({draft:proposal.draft,lineage:proposal.replan,model:proposal.model,expiresAt:proposal.expiresAt,digest:proposal.digest},null,2)}</pre><label className="skill-permission"><input name="serviceRepairReview" type="checkbox" checked={reviewed} disabled={off} onChange={e=>setReviewed(e.target.checked)}/><span>{tr('I reviewed the remaining work, paid input and cumulative fees.')}</span></label><button type="button" className="btn secondary small" disabled={off||!reviewed||proposal.expiresAt<=new Date().toISOString()} onClick={()=>onApply(proposal)}>{tr('Apply reviewed plugin repair')}</button></>}
  {error&&<p role="alert" className="chain-error">{tr(error)}</p>}
 </section>;
}

export function ServiceRepairPanel(props:ComponentProps<typeof ServiceRepairPanelContent>){return <ClientScope><ServiceRepairPanelContent key={JSON.stringify([props.scope,props.flow.id])} {...props}/></ClientScope>;}
