'use client';
import {useState} from 'react';
import {useLanguage} from '@/lib/i18n/context';
import {assertSkillDefinition,skillDefinitionHash,type SkillDefinition} from '@/lib/agentos/skill-definition';

export function SkillPanel({definitions=[],busy,onInstall}:{definitions?:SkillDefinition[];busy:boolean;onInstall:(definition:SkillDefinition)=>Promise<boolean>}){
 const {tr}=useLanguage(),[raw,setRaw]=useState(''),[message,setMessage]=useState('');
 let preview:SkillDefinition|undefined;try{const value=JSON.parse(raw);assertSkillDefinition(value);preview=value;}catch{}
 return <section className="panel" aria-label={tr('Install a versioned skill')}>
  <div className="panel-heading"><div><h2>{tr('Install a versioned skill')}</h2><p>{tr('Import a bounded transfer-analysis definition. Installation does not grant execution permission.')}</p></div></div>
  <form className="policy-body" onSubmit={async event=>{event.preventDefault();if(!preview)return;const saved=await onInstall(preview);if(saved){setRaw('');setMessage('Skill installed. Register a service and allow the skill in Permissions.');}}}>
   <label className="field">{tr('Skill definition JSON')}<input type="file" accept="application/json,.json" onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>4096){setMessage('Skill definition is invalid or too large.');return;}setRaw(await file.text());setMessage('');event.target.value='';}}/><textarea aria-label={tr('Skill definition JSON')} value={raw} onChange={event=>{setRaw(event.target.value);setMessage('');}} rows={6} maxLength={4096}/></label>
   {preview?<div className="form-note"><b>{preview.name} · {preview.version}</b><p>{preview.description}</p><p>{preview.capabilities.join(' · ')}</p><code style={{overflowWrap:'anywhere'}}>{skillDefinitionHash(preview)}</code></div>:raw?<p role="alert">{tr('Skill definition is invalid or too large.')}</p>:null}
   <div className="form-footer"><span>{tr('Definitions are immutable. Changes require a new version.')}</span><button className="btn secondary" disabled={busy||!preview}>{tr('Install skill')}</button></div>
   {message&&<p role="status">{tr(message)}</p>}
  </form>
  {definitions.length>0&&<div className="policy-body"><b>{tr('Installed extension skills')}</b>{definitions.map(d=><p key={d.id}><span>{d.name}</span> · <span className="mono">{d.id}</span></p>)}</div>}
 </section>;
}
