'use client';
import {useEffect,useRef,useState} from 'react';
import {useLanguage} from '@/lib/i18n/context';
import type {TaskInput} from '@/lib/agentos/types';
export function ChainDataInput({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const {tr}=useLanguage(),ref=useRef<HTMLTextAreaElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ref.current?.dispatchEvent(new Event('input',{bubbles:true}));},[value]);
 async function load(form:HTMLFormElement){
  setBusy(true);setError('');try{
   const fields=new FormData(form),body={account:String(fields.get('sourceAccount')),direction:String(fields.get('sourceDirection')),blockFrom:fields.get('sourceFrom')?Number(fields.get('sourceFrom')):undefined,blockTo:fields.get('sourceTo')?Number(fields.get('sourceTo')):undefined};
   const response=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}),data=await response.json() as {error?:string;input:TaskInput};
   if(!response.ok)throw new Error(data.error??'USDC data import failed.');onChange(JSON.stringify(data.input,null,2));
  }catch(error){setError(error instanceof Error?error.message:'USDC data import failed.');}finally{setBusy(false);}
 }
 return <><p className="form-note">{tr('Read finalized Ethereum USDC events. This does not move mainnet funds. Source amounts retain all six decimals; cent displays round down per transfer.')}</p>
  <label className="field">{tr('Treasury account')}<input name="sourceAccount" placeholder="0x…" maxLength={42}/></label>
  <label className="field">{tr('Transfer direction')}<select name="sourceDirection"><option value="all">{tr('Incoming and outgoing')}</option><option value="incoming">{tr('Incoming only')}</option><option value="outgoing">{tr('Outgoing only')}</option></select></label>
  <div className="form-grid"><label className="field">{tr('From block · optional')}<input name="sourceFrom" type="number" min="0"/></label><label className="field">{tr('To block · optional')}<input name="sourceTo" type="number" min="0"/></label></div>
  <p className="form-note">{tr('Blank range uses the latest finalized block. Limit: 10000 blocks and 25 transfers. Narrow the range if it exceeds the limit; records are never truncated.')}</p>
  <button type="button" className="btn secondary" disabled={busy} onClick={event=>{if(event.currentTarget.form)void load(event.currentTarget.form);}}>{tr(busy?'Importing USDC events…':'Import USDC events')}</button>
  {error&&<p role="alert">{tr(error)}</p>}
  <label className="field">{tr('Committed source input · JSON')}<textarea ref={ref} name="chainInput" rows={6} readOnly value={value} required/></label>
 </>;
}
