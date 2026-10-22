'use client';
import {ClientScope} from './client-scope';
import type {ComponentProps} from 'react';
import {useEffect,useRef,useState} from 'react';
import {AgentWorkflowTemplateClient,type TemplateDraft} from '@/sdk/workflow-templates';
import type {WorkflowTemplate,TemplateBinding} from '@/lib/agentos/workflow-templates';
import type {WorkflowStepDraft} from '@/lib/agentos/workflow-state';
import type {Agent} from '@/lib/agentos/types';
import type {SupplierDescriptor} from '@/lib/agentos/supplier';
import {submissionIntent} from '@/lib/agentos/client-intent';
import {useLanguage} from '@/lib/i18n/context';

function WorkflowTemplatePanelContent({scope,agents,suppliers,busy,ready,perform,source,onApply}:{scope:string;agents:Agent[];suppliers:SupplierDescriptor[];busy:boolean;ready:boolean;perform:(action:()=>Promise<void>)=>Promise<void>;source:()=>{steps:WorkflowStepDraft[];timeoutSeconds:number;parallelism?:number};onApply:(draft:TemplateDraft)=>void}){
 const {tr}=useLanguage(),[templates,setTemplates]=useState<WorkflowTemplate[]>([]),[selected,setSelected]=useState(''),[bindings,setBindings]=useState<TemplateBinding[]>([]),[name,setName]=useState('Reusable treasury workflow'),[revision,setRevision]=useState('1.0.0'),[description,setDescription]=useState(''),[importText,setImportText]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),generation=useRef(0),client=new AgentWorkflowTemplateClient('',{},scope),record=templates.find(t=>t.id===selected);
 async function refresh(epoch=generation.current){const list=await client.list();if(epoch===generation.current)setTemplates(list);}
 useEffect(()=>{const epoch=++generation.current;void refresh(epoch).catch(()=>{if(epoch===generation.current)setError('Workflow template service is unavailable.');});return()=>{generation.current++;};},[scope]); // eslint-disable-line react-hooks/exhaustive-deps
 function choose(value:string){setSelected(value);const target=templates.find(t=>t.id===value);setBindings(target?.definition.steps.map(()=>({agentId:''}))??[]);setNotice('');}
 const act=(action:(epoch:number)=>Promise<void>)=>perform(async()=>{const epoch=generation.current;setError('');setNotice('');try{await action(epoch);}catch(reason){if(epoch===generation.current)setError(reason instanceof Error?reason.message:'Workflow template service is unavailable.');}});
 return <section className="chain-proof" id="workflow-template-panel" aria-label={tr('Reusable workflow templates')}>
  <h3>{tr('Reusable workflow templates')}</h3><p>{tr('Templates save versioned skill slots, conditions and fee ceilings. They never save transfer rows, wallets, grants, signatures or supplier credentials.')}</p>
  <div className="form-grid"><label className="field">{tr('Template name')}<input name="templateName" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">{tr('Template revision')}<input name="templateRevision" maxLength={14} value={revision} onChange={e=>setRevision(e.target.value)}/></label></div>
  <label className="field">{tr('Template description')}<textarea name="templateDescription" maxLength={500} rows={2} value={description} onChange={e=>setDescription(e.target.value)}/></label>
  <button type="button" className="btn secondary small" disabled={busy||!ready||!name.trim()} onClick={()=>void act(async epoch=>{const payload={name,description,revision,...source()},intent=await submissionIntent(scope,'workflow-template',payload,sessionStorage);await client.save({...payload,requestId:intent.id});intent.acknowledge();if(epoch===generation.current){await refresh(epoch);setNotice('Workflow template saved. No purchase was created.');}})}>{tr('Save current workflow as template')}</button>
  <label className="field">{tr('Saved template')}<select name="workflowTemplate" value={selected} onChange={e=>choose(e.target.value)}><option value="">{tr('Select template')}</option>{templates.filter(t=>!t.archivedAt).map(t=><option key={t.id} value={t.id}>{t.definition.name} · {t.definition.revision}</option>)}</select></label>
  {record&&!record.archivedAt&&<>
   {record.definition.parallelism&&<p>{tr('Parallel execution')} · {tr('Maximum in-flight purchases')}: {record.definition.parallelism}</p>}<p>{record.definition.description} · {tr('Template digest')}: <code>{record.digest}</code></p>
   {record.definition.steps.map((slot,index)=><fieldset className="chain-proof" key={index}><legend>{tr('Step')} {index+1} · {slot.skill} · {(slot.budget/100).toFixed(2)}</legend>
    <label className="field">{tr('Bind template service')}<select name={'templateAgent'+index} value={bindings[index]?.agentId??''} onChange={e=>setBindings(bindings.map((b,i)=>i===index?{agentId:e.target.value}:b))}><option value="">{tr('Select service')}</option>{agents.filter(a=>a.enabled&&a.skill===slot.skill).map(a=><option key={a.id} value={a.id}>{a.name} · {a.skill} · {(a.price/100).toFixed(2)}</option>)}</select></label>
    <p>{tr(slot.executor==='builtin'?'Built-in service':'Independent skill supplier')} · {slot.input.from==='original'?tr('Original workflow input'):slot.input.from==='merge'?tr('Merge accepted results')+' '+slot.input.steps.map(i=>i+1).join(' + '):tr('Accepted result of step')+' '+(slot.input.step+1)}{slot.when&&' · '+tr('Run condition')+': '+tr('Step')+' '+(slot.when.step+1)+' '+slot.when.field+' '+slot.when.operator+' '+String(slot.when.value)}</p>
    {slot.executor==='supplier'&&<label className="field">{tr('Execution provider')}<select name={'templateSupplier'+index} value={bindings[index]?.supplierId??''} onChange={e=>setBindings(bindings.map((b,i)=>i===index?{...b,supplierId:e.target.value}:b))}><option value="">{tr('Select supplier')}</option>{suppliers.filter(s=>s.skills.includes(slot.skill)).map(s=><option key={s.id} value={s.id}>{s.name} · {s.id}</option>)}</select></label>}
   </fieldset>)}
   <p className="form-note">{tr('Applying replaces the editable steps and clears the Vault selection. Current input stays in the editor. Review providers and choose a fresh session before starting; supplier authority and exact quotes are checked at execution.')}</p>
   <button type="button" className="btn secondary small" disabled={busy||!ready||bindings.length!==record.definition.steps.length||bindings.some((b,i)=>!b.agentId||record.definition.steps[i].executor==='supplier'&&!b.supplierId)} onClick={()=>void act(async epoch=>{const draft=await client.instantiate(record,bindings);if(epoch===generation.current){onApply(draft);setNotice('Template applied to the editor. No purchase was created.');}})}>{tr('Apply template to editor')}</button>
   <label className="field">{tr('Portable template JSON')}<textarea name="templateExport" readOnly rows={5} value={JSON.stringify({definition:record.definition,digest:record.digest},null,2)}/></label>
  </>}
  <label className="field">{tr('Import template JSON')}<textarea name="templateImport" rows={3} maxLength={65536} value={importText} onChange={e=>setImportText(e.target.value)}/></label>
  <button type="button" className="btn secondary small" disabled={busy||!importText.trim()} onClick={()=>void act(async epoch=>{const parsed=JSON.parse(importText),intent=await submissionIntent(scope,'workflow-template-import',parsed,sessionStorage);await client.import(intent.id,parsed);intent.acknowledge();if(epoch===generation.current){await refresh(epoch);setNotice('Workflow template imported. Bind services before reuse.');}})}>{tr('Import workflow template')}</button>
  {templates.map(t=><div className="chain-actions" key={t.id}><span>{t.definition.name} · {t.definition.revision} · {tr(t.archivedAt?'Archived':'Available')}</span><button type="button" className="btn secondary small" disabled={busy} onClick={()=>void act(async epoch=>{await client.archive(t,!t.archivedAt);if(epoch===generation.current){await refresh(epoch);if(selected===t.id)choose('');}})}>{tr(t.archivedAt?'Restore template':'Archive template')}</button></div>)}
  {notice&&<p role="status">{tr(notice)}</p>}{error&&<p role="alert">{tr(error)}</p>}
 </section>;
}

export function WorkflowTemplatePanel(props:ComponentProps<typeof WorkflowTemplatePanelContent>){return <ClientScope><WorkflowTemplatePanelContent key={JSON.stringify([props.scope])} {...props}/></ClientScope>;}
