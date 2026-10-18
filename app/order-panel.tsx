'use client';
import { useState,type FormEvent } from 'react';
import { Play,RefreshCw,Download } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/provider';
import { AgentOrderClient } from '@/sdk/orders';
import { inputEvidence,type AgentWalletSession } from '@/sdk/wallet';
import { normalizeInput } from '@/lib/agentos/engine';
import type { Agent,Scenario } from '@/lib/agentos/types';
import type { ChainOrder,OrderStatus } from '@/lib/agentos/orders';
const statusLabels:Record<OrderStatus,string>={'awaiting-funding':'Awaiting funding',queued:'Queued',running:'Running','awaiting-settlement':'Awaiting chain settlement',paused:'Needs recovery',completed:'Completed',refunded:'Refunded',cancelled:'Cancelled'};
export function OrderPanel({session,agents,orders,busy,perform,onChanged}:{session:AgentWalletSession|null;agents:Agent[];orders:ChainOrder[];busy:boolean;perform:(action:()=>Promise<void>)=>Promise<void>;onChanged?:()=>Promise<void>}){
  const {tr}=useLanguage(),[mode,setMode]=useState('fixture'),[hashes,setHashes]=useState<Record<string,string>>({}),[limit,setLimit]=useState(10);
  const client=session?new AgentOrderClient(session):null;
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const fields=new FormData(event.currentTarget);
    await perform(async()=>{
      const input=mode==='custom'?normalizeInput({dataset:'custom-transfers-v1',blockFrom:Number(fields.get('blockFrom')),blockTo:Number(fields.get('blockTo')),records:JSON.parse(String(fields.get('records')))}):undefined;
      const requestId=crypto.randomUUID(),spec=session!.deployment.mode==='testnet'?{datasetUrl:String(fields.get('datasetUrl')),artifactUrl:String(fields.get('artifactUrl')),datasetHash:inputEvidence({id:'chain-'+requestId,input:normalizeInput(input)},session!.account).datasetHash}:undefined;
      await client!.create({requestId,title:String(fields.get('title')),agentId:String(fields.get('agentId')),budget:Math.round(Number(fields.get('budget'))*100),input,spec,scenario:String(fields.get('scenario')) as Scenario,timeoutSeconds:Number(fields.get('timeoutSeconds'))});await onChanged?.();
    });
  }
  const run=(action:()=>Promise<unknown>)=>void perform(async()=>{await action();await onChanged?.();});
  return <div className="order-panel" id="prefunded-orders"><h3>{tr('Pre-funded agent execution')}</h3><p className="form-note">{tr('Commit the input, fund escrow, then authorize server execution. No sandbox credits are charged.')}</p>
    {session?<details className="order-create"><summary>{tr('Create a pre-funded order')}</summary><form onSubmit={create}>
      <div className="form-grid"><label className="field">{tr('Task title')}<input name="title" required maxLength={160} defaultValue={tr('Pre-funded transfer analysis')}/></label><label className="field">{tr('Agent service')}<select name="agentId">{agents.filter(a=>a.enabled).map(a=><option key={a.id} value={a.id}>{a.name} · {(a.price/100).toFixed(2)} {tr('tokens')}</option>)}</select></label></div>
      <div className="form-grid"><label className="field">{tr('Budget cap · token units')}<input name="budget" type="number" min="0.01" max="10000" step="0.01" defaultValue="10" required/></label><label className="field">{tr('Execution window · seconds')}<input name="timeoutSeconds" type="number" min="1" max="86400" defaultValue="300" required/></label></div>
      <label className="field">{tr('Input data')}<select value={mode} onChange={e=>setMode(e.target.value)}><option value="fixture">{tr('Built-in transfer fixture')}</option><option value="custom">{tr('Custom transfer records')}</option></select></label>
      {mode==='custom'&&<><div className="form-grid"><label className="field">{tr('From block')}<input name="blockFrom" type="number" min="0" defaultValue="1" required/></label><label className="field">{tr('To block')}<input name="blockTo" type="number" min="0" defaultValue="100" required/></label></div><label className="field">{tr('Transfer records · JSON')}<textarea name="records" rows={4} maxLength={32768} required defaultValue={JSON.stringify([{block:1,from:'treasury.eth',to:'builder.eth',cents:123},{block:2,from:'treasury.eth',to:'research.eth',cents:456}],null,2)}/></label></>}
      {session.deployment.mode==='testnet'&&<><div className="form-grid"><label className="field">{tr('Immutable evidence URL')}<input name="datasetUrl" type="url" required placeholder="https://…"/></label><label className="field">{tr('Delivery artifact URL')}<input name="artifactUrl" type="url" required placeholder="https://…"/></label></div><p className="form-note">{tr('Publish exact input bytes before funding. Publish the exported artifact after execution, then reconcile the CRE settlement transaction.')}</p></>}
      <label className="field">{tr('Execution scenario')}<select name="scenario"><option value="success">{tr('Successful delivery')}</option><option value="injection">{tr('Injection defense')}</option><option value="invalid-delivery">{tr('Invalid delivery')}</option><option value="interruption">{tr('Crash & recovery')}</option></select></label>
      <div className="chain-actions"><button className="btn primary" disabled={busy||!agents.some(a=>a.enabled)}><Play size={14}/>{tr('Commit order input')}</button></div>
    </form></details>:<p className="form-note">{tr('Connect a wallet above to create or fund an order.')}</p>}
    <p className="form-note">{tr('The final settlement checkpoint commits an immutable report under the current policy. Cancellation stops new operations; an already committed settlement must be reconciled.')}</p>
    {!orders.length&&<p className="form-note">{tr('No pre-funded orders yet.')}</p>}
    {orders.slice(0,limit).map(order=>{const mine=session&&order.buyer.toLowerCase()===session.account.toLowerCase()&&order.deployment.escrow.toLowerCase()===session.deployment.escrow.toLowerCase(),hash=hashes[order.id]??'',validHash=/^0x[0-9a-fA-F]{64}$/.test(hash),terminal=['completed','refunded','cancelled'].includes(order.status);return <article className="order-card" key={order.id}>
      <div className="panel-heading"><div><h3>{order.title}</h3><code>{order.id}</code></div><span className="pill">{tr(statusLabels[order.status])}</span></div>
      <p className="form-note">{tr('Frozen quote')}: {(order.quote/100).toFixed(2)} {tr('tokens')} · {order.deployment.mode==='local'?tr('Local EVM · 31337'):tr('Sepolia · 11155111')} · {tr('Checkpoint')}: {order.step}/6</p>
      <p className="form-note">{tr('Input commitment')}: <code>{order.inputHash}</code></p>
      {order.failure&&<p className="chain-error">{tr(order.failure)}</p>}
      {order.lastError&&<p className="chain-error" role="status">{tr(order.lastError)}</p>}
      {order.settlement&&<div className="chain-proof"><b>{tr('Server verified settlement')}: {tr(order.settlement.status==='paid'?'Paid':'Refunded')}</b><code>{order.settlement.transactionHash}</code></div>}
      <div className="chain-actions"><a className="btn secondary small" href={'/api/orders?'+new URLSearchParams({id:order.id})} download><Download size={13}/>{tr('Export order context')}</a><a className="text-button" href={'/api/orders?'+new URLSearchParams({id:order.id,kind:'dataset'})} download>{tr('Export chain evidence')}</a>{(order.output||order.failure)&&<a className="text-button" href={'/api/orders?'+new URLSearchParams({id:order.id,kind:'artifact'})} download>{tr('Export chain artifact')}</a>}</div>
      {mine&&<><div className="chain-actions">{order.status==='awaiting-funding'&&<button className="btn primary small" disabled={busy} onClick={()=>run(async()=>{const funding=await session!.fundOrder(order,3600,h=>setHashes(prev=>({...prev,[order.id]:h})));setHashes(prev=>({...prev,[order.id]:funding.transactionHash}));await client!.activate(order,funding);})}>{tr('Fund & authorize execution')}</button>}{!terminal&&<button className="btn secondary small" disabled={busy} onClick={()=>run(()=>client!.sync(order.id))}><RefreshCw size={13}/>{tr('Sync order')}</button>}{!terminal&&!order.settlementAuthorization&&<button className="text-button" disabled={busy} onClick={()=>run(()=>client!.cancel(order.id))}>{tr('Cancel order')}</button>}{order.status==='paused'&&<button className="btn primary small" disabled={busy} onClick={()=>run(()=>client!.resume(order.id))}>{tr('Resume safely')}</button>}{order.funding&&!order.settlement&&<button className="text-button" disabled={busy} onClick={()=>run(async()=>{const refunded=await session!.refund(order);await client!.sync(order.id,refunded.transactionHash);})}>{tr('Refund expired escrow')}</button>}</div>
        {!terminal&&order.status!=='paused'&&<div className="form-grid"><label className="field">{tr('Existing funding or settlement hash')}<input value={hash} onChange={e=>setHashes(prev=>({...prev,[order.id]:e.target.value}))} placeholder="0x…"/></label><div className="chain-actions"><button className="btn secondary small" disabled={busy||!validHash} onClick={()=>run(async()=>{if(!order.funding)await client!.activate(order,await session!.evidence(order,hash as `0x${string}`,'funding',order.spec));else await client!.sync(order.id,hash as `0x${string}`);})}>{tr(order.funding?'Reconcile settlement':'Confirm existing funding')}</button></div></div>}
      </>}
      <details><summary>{tr('Execution checkpoints')}</summary>{order.events.map(e=><p className="form-note" key={e.id}>{new Date(e.at).toLocaleTimeString()} · {tr(e.title)}</p>)}{order.output&&<pre className="artifact-json">{JSON.stringify(order.output,null,2)}</pre>}</details>
    </article>;})}
    {orders.length>limit&&<button className="text-button" onClick={()=>setLimit(limit+10)}>{tr('Show older orders')}</button>}
  </div>;
}
