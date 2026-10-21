'use client';
import {useEffect,useState} from 'react';
import type {SupplierDescriptor} from '@/lib/agentos/supplier';
import {useLanguage} from '@/lib/i18n/context';
export function SupplierCatalog(){
 const {tr}=useLanguage(),[suppliers,setSuppliers]=useState<SupplierDescriptor[]>([]),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/suppliers',{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();const data=await response.json() as {descriptor:SupplierDescriptor;descriptors?:SupplierDescriptor[]};if(!controller.signal.aborted)setSuppliers(data.descriptors??[data.descriptor]);}).catch(()=>{if(!controller.signal.aborted)setUnavailable(true);});return()=>controller.abort();},[]);
 return <section className="panel chain-panel" id="supplier-catalog"><div className="panel-heading"><div><h2>{tr('Execution provider directory')}</h2><p>{tr('Configured execution providers. Registry delegation is checked before each purchase.')}</p></div></div><div className="chain-body">
  {unavailable&&<p role="status">{tr('Supplier directory is unavailable.')}</p>}
  {suppliers.map(s=><article className="chain-proof" key={s.id}><h3>{s.name}</h3><p>{s.id} · {s.revision}</p><p>{tr('Supported skills')}: {s.skills.join(', ')}</p><p>{tr('Delivery signer')}: <code>{s.signer}</code></p><p>{tr('Configuration hash')}: <code>{s.configHash}</code></p></article>)}
  <p className="form-note">{tr('Each service has its own registry identity and payment wallet. Select and authorize a provider in Agents, then choose it in Wallet & escrow. Directory entries do not grant spending permission.')}</p>
 </div></section>;
}
