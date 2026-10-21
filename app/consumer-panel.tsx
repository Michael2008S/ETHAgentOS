'use client';
import {useEffect,useState,useCallback} from 'react';
import {AgentConsumerClient} from '@/sdk/consumers';
import type {ConsumerCredential} from '@/lib/agentos/consumer-auth';
import {useLanguage} from '@/lib/i18n/context';
export function ConsumerPanel(){
 const {tr}=useLanguage(),[credentials,setCredentials]=useState<ConsumerCredential[]>([]),[issued,setIssued]=useState<{id:string;token:string}|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>{try{setCredentials(await new AgentConsumerClient().list());}catch{setMessage('Consumer access is unavailable.');}},[]);useEffect(()=>{void refresh();},[refresh]);
 return <details className="chain-details"><summary>{tr('Recovery consumer access')}</summary>
  <p className="form-note">{tr('Credentials can drain only this workspace’s authorized queue and read aggregate status. They cannot create tasks or change permissions.')}</p>
  <form onSubmit={async event=>{event.preventDefault();setBusy(true);setIssued(null);try{const f=new FormData(event.currentTarget),result=await new AgentConsumerClient().issue({name:String(f.get('consumerName')),ttlSeconds:Number(f.get('consumerTTL')),intervalMs:5000});setIssued({id:result.credential.id,token:result.token});setMessage('Credential issued. No consumer or schedule has been started.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'Consumer access is unavailable.');}finally{setBusy(false);}}}>
   <div className="form-grid"><label className="field">{tr('Consumer name')}<input name="consumerName" required maxLength={60} defaultValue={tr('Recovery worker')}/></label><label className="field">{tr('Credential lifetime')}<select name="consumerTTL" aria-label={tr('Credential lifetime')} defaultValue="86400"><option value="3600">{tr('One hour')}</option><option value="86400">{tr('One day')}</option><option value="604800">{tr('Seven days')}</option></select></label></div>
   <button className="btn secondary small" disabled={busy}>{tr('Issue consumer credential')}</button>
  </form>
  {issued&&<div><p className="form-note">{tr('Shown once. Store the token in your consumer host’s secret environment. Refreshing this page clears it.')}</p><label className="field">{tr('Consumer token')}<input type="password" readOnly value={issued.token} autoComplete="off"/></label><button className="btn secondary small" onClick={async()=>{try{await navigator.clipboard.writeText(issued.token);setMessage('Consumer token copied.');}catch{setMessage('Clipboard is unavailable.');}}}>{tr('Copy consumer token')}</button></div>}
  {credentials.map(c=><div className="form-note" key={c.id}><b>{c.name}</b><p>{tr('Expires')}: {new Date(c.expiresAt).toLocaleString()} · {tr(c.revokedAt?'Revoked':Date.parse(c.expiresAt)<=Date.now()?'Expired':'Active')}</p>{!c.revokedAt&&<button className="btn secondary small" disabled={busy} onClick={async()=>{setBusy(true);try{await new AgentConsumerClient().revoke(c.id);if(issued?.id===c.id)setIssued(null);await refresh();setMessage('Consumer credential revoked.');}catch{setMessage('Consumer access is unavailable.');}finally{setBusy(false);}}}>{tr('Revoke consumer credential')}</button>}</div>)}
  {message&&<p role="status">{tr(message)}</p>}
 </details>;
}
