'use client';
import { useEffect, useState } from 'react';
import { Download, FileCheck2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/context';
import { TASK_STATUSES, type queryMemory } from '@/lib/agentos/memory';
import type { Agent } from '@/lib/agentos/types';

type Page = ReturnType<typeof queryMemory>;
export function MemoryPanel({agents,revision,onInspect}:{agents:Agent[];revision:number;onInspect:(id:string)=>void}) {
  const {tr}=useLanguage();
  const [q,setQ]=useState(''),[agentId,setAgentId]=useState(''),[status,setStatus]=useState(''),[artifactsOnly,setArtifactsOnly]=useState(false),[offset,setOffset]=useState(0);
  const [data,setData]=useState<Page|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const params=new URLSearchParams({q,agentId,status,artifactsOnly:String(artifactsOnly),offset:String(offset),limit:'20'}).toString();
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    const timer=setTimeout(()=>{
      void (async()=>{
        try {
          const response=await fetch('/api/memory?'+params,{signal:controller.signal,cache:'no-store'});
          const result=await response.json() as Page & {error?:string};
          if(!response.ok)throw new Error(result.error??'Memory search failed.');
          if(!controller.signal.aborted)setData(result);
        }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Memory search failed.');}
        finally{if(!controller.signal.aborted)setLoading(false);}
      })();
    },200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[params,revision,retry]);
  return <section className="panel">
    <div className="panel-heading"><h2>{tr('Task memory')}</h2><a className="btn secondary small" href={'/api/memory?'+params+'&format=export'} download><Download size={14}/>{tr('Export matching context')}</a></div>
    <div className="memory-filters">
      <label className="field">{tr('Search memory')}<input value={q} maxLength={200} placeholder={tr('Title, input, result, event or hash')} onChange={e=>{setQ(e.target.value);setOffset(0);}}/></label>
      <label className="field">{tr('Agent service')}<select value={agentId} onChange={e=>{setAgentId(e.target.value);setOffset(0);}}><option value="">{tr('All agents')}</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
      <label className="field">{tr('Status')}<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">{tr('All statuses')}</option>{TASK_STATUSES.map(value=><option key={value} value={value}>{tr(value[0].toUpperCase()+value.slice(1))}</option>)}</select></label>
      <label className="memory-checkbox"><input type="checkbox" checked={artifactsOnly} onChange={e=>{setArtifactsOnly(e.target.checked);setOffset(0);}}/>{tr('With output only')}</label>
    </div>
    {loading?<p className="memory-message" role="status"><Loader2 size={16} className="spin"/>{tr('Searching memory…')}</p>:error?<div className="memory-message" role="alert">{tr(error)} <button className="text-button" onClick={()=>setRetry(value=>value+1)}>{tr('Retry connection')}</button></div>:data?.items.length?<div className="artifact-list">{data.items.map(task=><div key={task.id}><span className="artifact-icon"><FileCheck2 size={21}/></span><div><b>{task.title}</b><span className="mono">{task.agentId} · {tr(task.status[0].toUpperCase()+task.status.slice(1))} · {(task.outputHash??task.inputHash??task.id).slice(0,18)}</span></div><button className="btn secondary small" onClick={()=>onInspect(task.id)}>{tr('Inspect')}</button><a className="icon-button" aria-label={tr('Export task context')+' '+task.title} href={'/api/exports?kind=context&taskId='+encodeURIComponent(task.id)} download><Download size={17}/></a></div>)}</div>:<div className="empty"><h3>{tr('No matching memories')}</h3><p>{tr('Change the filters or run a task to create persistent context.')}</p></div>}
    <div className="memory-pagination"><span aria-live="polite">{loading?'…':data?.total??0} {tr('matching tasks')}</span><div><button className="btn secondary small" disabled={loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{tr('Previous')}</button><button className="btn secondary small" disabled={loading||offset+20>=(data?.total??0)} onClick={()=>setOffset(offset+20)}>{tr('Next')}</button></div></div>
  </section>;
}
