'use client';
import { useEffect,useState,useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/context';
import type { RuntimeHealth } from '@/lib/agentos/health';
import {ConsumerPanel} from './consumer-panel';
export function useRuntimeHealth(){
 const [health,setHealth]=useState<RuntimeHealth|null>(null);
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/runtime/health',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error();setHealth(await r.json() as RuntimeHealth);}catch{setHealth(null);}},[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[refresh]);return {health,refresh};
}
export function RuntimePanel({health,refresh}:{health:RuntimeHealth|null;refresh:()=>Promise<void>}){
 const {tr}=useLanguage(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const labels:Record<string,string>={database:'Database',chain:'EVM RPC',model:'Model service',planning:'Workflow planning model',supplier:'Supplier service',consumer:'Queue consumer'};
 return <section className="panel" id="runtime-status"><div className="panel-heading"><h2>{tr('Runtime status')}</h2><button className="text-button" onClick={()=>void refresh()}>{tr('Refresh status')}</button></div><div className="chain-body">
 <p role="status">{tr(health?.ready?'Healthy':'Degraded')}{health?' · '+new Date(health.checkedAt).toLocaleTimeString():''}</p>
 {health?<><div className="chain-summary">{Object.entries(health.services).map(([key,value])=><div key={key}><span>{tr(labels[key]??key)}</span><b>{tr(value)}</b></div>)}</div><p>{tr('Last consumer contact')}: {health.lastConsumerAt?new Date(health.lastConsumerAt).toLocaleString():tr('Not observed')}</p><p>{tr('Queue')}: {Object.entries(health.queue).map(([key,n])=>tr(key)+' '+n).join(' · ')}</p>{health.oldestPendingAt&&<p>{tr('Oldest pending job')}: {new Date(health.oldestPendingAt).toLocaleString()}</p>}<button disabled={busy||!health.queue.dead} className="btn secondary small" onClick={async()=>{setBusy(true);try{const r=await fetch('/api/runtime/queue',{method:'POST'});if(!r.ok)throw new Error();setMessage('Failed jobs queued for retry.');await refresh();}catch{setMessage('Queue retry failed.');}finally{setBusy(false);}}}>{tr('Retry failed jobs')}</button></>:<p>{tr('Status unavailable. Check the local services.')}</p>}
 <p className="form-note">{tr('Consumer contact is observed activity, not a guarantee of future scheduling.')}</p>{message&&<p role="status">{tr(message)}</p>}
 <ConsumerPanel/>
 </div></section>;
}
