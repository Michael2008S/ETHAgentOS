'use client';
import {useBoundReview} from './use-bound-review';
import {ClientScope} from './client-scope';
import type {ComponentProps} from 'react';
import {useEffect,useRef,useState} from 'react';
import {AgentServicePlanClient} from '@/sdk/service-plans';
import {type ServiceProposal} from '@/lib/agentos/service-plans';
import {type ServiceDescriptor} from '@/lib/agentos/service-catalog';
import {submissionIntent} from '@/lib/agentos/client-intent';
import {ServiceTemplatePanel} from './service-template-panel';
import {useLanguage} from '@/lib/i18n/context';
function ServicePlanningPanelContent({scope,input,totalBudget,perStepBudget,onApply,disabled=false}:{disabled?:boolean;scope:string;input:string;totalBudget:number;perStepBudget:number;onApply:(plan:ServiceProposal)=>void}){
 const {tr}=useLanguage(),[goal,setGoal]=useState('Normalize unique labels, then write a compact text report.'),[maxSteps,setMaxSteps]=useState(4),[entries,setEntries]=useState<ServiceDescriptor[]>([]),[plans,setPlans]=useState<ServiceProposal[]>([]),[selected,setSelected]=useState<ServiceProposal|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),lock=useRef(false),api=()=>new AgentServicePlanClient(scope);
 useEffect(()=>{const current=++generation.current;void Promise.all([api().catalogue(),api().list()]).then(([catalog,history])=>{if(current===generation.current){setEntries(catalog);setPlans(history);}}).catch(()=>{if(current===generation.current)setError('Refresh the service catalogue after starting the local runtime.');});return()=>{generation.current++;};},[scope]); // eslint-disable-line react-hooks/exhaustive-deps
 const [reviewed,setReviewed]=useBoundReview(JSON.stringify([input,totalBudget,perStepBudget,goal,maxSteps]));
 function act(action:(current:number)=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');const current=generation.current;void action(current).catch(reason=>{if(current===generation.current)setError(reason instanceof Error?reason.message:'Service planning unavailable.');}).finally(()=>{if(current===generation.current){lock.current=false;setBusy(false);}});}
 return <article className="chain-proof" id="service-planning-panel"><h3>{tr('Unified services and plugin planning')}</h3><p>{tr('Business skills and JSON plugins share versioned service descriptions. Their execution adapters keep explicit data contracts. Planning never grants execution or payment permission.')}</p>
  <button type="button" className="btn secondary small" disabled={disabled||busy} onClick={()=>act(async current=>{const [catalog,history]=await Promise.all([api().catalogue(),api().list()]);if(current===generation.current){setEntries(catalog);setPlans(history);}})}>{tr('Refresh unified service catalogue')}</button>
  <details><summary>{tr('Review available service contracts')} · {entries.length}</summary>{entries.map(s=><div key={s.id} className="chain-proof"><b>{s.name}</b><p><code style={{overflowWrap:'anywhere'}}>{s.id}</code> · {s.executor} · {s.input.protocol} → {s.output.protocol}</p><pre className="artifact-json">{JSON.stringify(s,null,2)}</pre></div>)}</details>
  <label className="field">{tr('Plugin planning goal')}<textarea name="pluginPlanGoal" maxLength={500} rows={2} value={goal} disabled={disabled||busy} onChange={e=>setGoal(e.target.value)}/></label>
  <label className="field">{tr('Maximum planned plugin steps')}<input name="pluginPlanMaxSteps" type="number" min={1} max={8} value={maxSteps} disabled={disabled||busy} onChange={e=>setMaxSteps(Number(e.target.value))}/></label>
  <p className="form-note">{tr('The planner uses the original JSON and fee limits below. Install the services you want first. Saved proposals expire after five minutes; applying one clears the selected payment authority.')}</p>
  <button type="button" className="btn secondary small" disabled={disabled||busy||goal.trim().length<3} onClick={()=>act(async current=>{const payload={goal,input:JSON.parse(input),totalBudget,perStepBudget,maxSteps,timeoutSeconds:600},intent=await submissionIntent(scope,'service-plan',payload,sessionStorage),p=await api().propose({requestId:intent.id,...payload});intent.acknowledge();if(current===generation.current){setSelected(p);setReviewed(false);setPlans(await api().list());}})}>{tr('Generate or retry plugin plan')}</button>
  <label className="field">{tr('Saved service plans')}<select name="savedServicePlan" value={selected?.id??''} disabled={disabled||busy} onChange={e=>{setSelected(plans.find(p=>p.id===e.target.value)??null);setReviewed(false);}}><option value="">{tr('Select a plan')}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.parameters.goal} · {p.status}</option>)}</select></label>
  <ServiceTemplatePanel scope={scope} source={selected} input={input} totalBudget={totalBudget} perStepBudget={perStepBudget} disabled={disabled||busy} onProposal={p=>{setSelected(p);setReviewed(false);setPlans(old=>[p,...old.filter(s=>s.id!==p.id)]);}}/>
  {selected&&<div className="chain-proof"><p>{tr('Plan expires')}: {selected.expiresAt}</p><pre className="artifact-json">{JSON.stringify(selected.draft,null,2)}</pre><details><summary>{tr('Review model and catalog evidence')}</summary><pre className="artifact-json">{JSON.stringify(selected,null,2)}</pre></details>
   <label className="skill-permission"><input name="servicePlanReview" type="checkbox" checked={reviewed} disabled={disabled||busy} onChange={e=>setReviewed(e.target.checked)}/><span>{tr('I reviewed the selected services, input dependencies, code commitments and fees.')}</span></label>
   <div className="chain-actions"><button type="button" className="btn secondary small" disabled={disabled||busy||!reviewed||selected.status!=='proposed'||selected.expiresAt<=new Date().toISOString()} onClick={()=>onApply(selected)}>{tr('Apply reviewed plugin plan')}</button><button type="button" className="text-button" disabled={disabled||busy||selected.status!=='proposed'} onClick={()=>act(async current=>{const p=await api().dismiss(selected.id);if(current===generation.current){setSelected(p);setReviewed(false);setPlans(await api().list());}})}>{tr('Dismiss plugin plan')}</button></div>
  </div>}{error&&<p role="alert" className="chain-error">{tr(error)}</p>}
 </article>;
}

export function ServicePlanningPanel(props:ComponentProps<typeof ServicePlanningPanelContent>){return <ClientScope><ServicePlanningPanelContent key={JSON.stringify([props.scope])} {...props}/></ClientScope>;}
