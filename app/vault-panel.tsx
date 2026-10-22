'use client';
import {useEffect,useRef,useState} from 'react';
import {formatUnits} from 'viem';
import {AgentVaultClient} from '@/sdk/vault';
import type {AgentWalletSession} from '@/sdk/wallet';
import type {VaultSession} from '@/lib/agentos/vault';
import {useLanguage} from '@/lib/i18n/context';
type View={balance:string;spent:string;decimals:number;epoch:string;owner:string;vault:string};
export function VaultPanel({session,busy,perform,onSessions,refreshKey}:{session:AgentWalletSession;busy:boolean;perform:(action:()=>Promise<void>)=>Promise<void>;onSessions:(sessions:VaultSession[])=>void;refreshKey:string}){
 const {tr}=useLanguage(),[view,setView]=useState<View|null>(null),[sessions,setSessions]=useState<VaultSession[]>([]),[error,setError]=useState('');
 const generation=useRef(0);
 const client=new AgentVaultClient(session);
 async function refresh(){const request=++generation.current;try{const data=await client.sessions(),current=data.view as View|null;if(request!==generation.current)return;setView(current);setSessions(data.sessions);onSessions(data.sessions.filter(s=>s.signature&&!s.revokedAt&&s.owner.toLowerCase()===session.account.toLowerCase()&&s.vault.toLowerCase()===current?.vault.toLowerCase()&&s.epoch===current?.epoch&&BigInt(s.expires)>BigInt(Math.floor(Date.now()/1000))));setError('');}catch{if(request!==generation.current)return;setError('Vault status unavailable.');onSessions([]);}}
 useEffect(()=>{void refresh();return()=>{generation.current++;onSessions([]);};},[session,refreshKey]);
 if(!session.deployment.vault)return <p className="form-note">{tr('AgentVault is not configured.')}</p>;
 return <details className="chain-proof"><summary>{tr('AgentVault · bounded purchasing')}</summary>
  <p className="form-note">{tr('Grant once, then purchase without signing every order. Funds return to the Vault on refund. Refunds do not restore this session allowance.')}</p>
  {error&&<p role="alert">{tr(error)}</p>}
  {view&&<p>{tr('Vault balance')}: {formatUnits(BigInt(view.balance),view.decimals)} · {tr('Daily spend')}: {formatUnits(BigInt(view.spent),view.decimals)}</p>}
  <form onSubmit={event=>{event.preventDefault();const fields=new FormData(event.currentTarget);void perform(async()=>{try{await client.authorize({depositCents:Math.round(Number(fields.get('deposit'))*100),perTaskCents:Math.round(Number(fields.get('perTask'))*100),totalCents:Math.round(Number(fields.get('total'))*100),dailyCents:Math.round(Number(fields.get('daily'))*100),durationSeconds:Number(fields.get('duration')),...(String(fields.get('sellers')??'').trim()?{sellers:String(fields.get('sellers')).trim().split(/[\s,]+/) as `0x${string}`[]}: {})});}finally{await refresh();}});}}>
   <div className="form-grid"><label className="field">{tr('Deposit · token units')}<input name="deposit" type="number" min="0" step="0.01" defaultValue="20" required/></label><label className="field">{tr('Per-purchase cap')}<input name="perTask" type="number" min="0.01" step="0.01" defaultValue="5" required/></label></div>
   <div className="form-grid"><label className="field">{tr('Session total cap')}<input name="total" type="number" min="0.01" max="10000" step="0.01" defaultValue="10" required/></label><label className="field">{tr('Authorization duration · seconds')}<input name="duration" type="number" min="60" max="86400" defaultValue="3600" required/></label></div>
   <label className="field">{tr('Onchain daily cap')}<input name="daily" type="number" min="0.01" max="10000" step="0.01" defaultValue="20" required/><small>{tr('Daily spend includes earlier grants today. A new session does not reset it.')}</small></label>
   <label className="field">{tr('Additional permitted sellers')}<textarea name="sellers" rows={2} maxLength={350} placeholder="0x…"/><small>{tr('Optional wallet addresses separated by commas or spaces. The default seller remains included; every selected address is approved onchain and committed in the signed session.')}</small></label>
   <p className="form-note">{tr('The grant is limited to this workspace, current allowed skills and the selected sellers. Onchain daily limits also apply.')}</p>
   <button className="btn secondary" disabled={busy}>{tr('Deposit, grant & sign session')}</button>
  </form>
  <form onSubmit={event=>{event.preventDefault();const cents=Math.round(Number(new FormData(event.currentTarget).get('withdraw'))*100);void perform(async()=>{try{await client.withdraw(cents);}finally{await refresh();}});}}><label className="field">{tr('Withdraw from Vault · token units')}<input name="withdraw" type="number" min="0.01" step="0.01" required/></label><button className="btn secondary small" disabled={busy}>{tr('Withdraw to owner')}</button></form>
  <p className="form-note">{tr('Revocation prevents new escrow funding. Already funded orders keep their original settlement and refund rules.')}</p>
  {sessions.filter(s=>s.signature).map(s=><div key={s.sessionId}><p><code>{s.sessionId}</code> · {tr(s.revokedAt?'Revoked':'Authorized')} · {tr('Session total cap')}: {(s.totalCents/100).toFixed(2)}</p><button type="button" className="btn secondary small" disabled={busy||!!s.revokedAt} onClick={()=>void perform(async()=>{try{await client.revokeSession(s.sessionId);}finally{await refresh();}})}>{tr('Revoke this session')}</button></div>)}
  <button type="button" className="btn secondary small" disabled={busy} onClick={()=>void refresh()}>{tr('Refresh Vault status')}</button>
 </details>;
}
