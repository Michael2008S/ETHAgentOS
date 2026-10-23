'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLanguage} from '@/lib/i18n/context';
import {AgentCCIPClient} from '@/sdk/ccip';
import {ccipDraftSchema,ccipTerminal,type CCIPJob} from '@/lib/agentos/ccip-tasks';
import {submissionIntent} from '@/lib/agentos/client-intent';
import {DraftForm} from './draft-form';
const initial={title:'Treasury report',budget:'1.00',duration:'600',scenario:'success',records:JSON.stringify([{block:1,from:'treasury',to:'research',cents:123},{block:2,from:'treasury',to:'operations',cents:456}],null,2)};
export function CCIPPanel({scope}:{scope:string}){
 const {language}=useLanguage(),t=(en:string,zh:string)=>language==='zh-CN'?zh:en;
 const client=useRef(new AgentCCIPClient('')),lock=useRef(false);
 const [fields,setFields]=useState(initial),[reviewed,setReviewed]=useState(false),[jobs,setJobs]=useState<CCIPJob[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(async()=>{const tasks=await client.current.list();if(client.current.scope!==scope)throw Error('CCIP workspace changed. Refresh the page.');setJobs(tasks);},[scope]);
 useEffect(()=>{let active=true;const read=()=>{if(active&&!lock.current)void refresh().catch(e=>{if(active)setError(e.message);});};read();const timer=setInterval(read,2000);return()=>{active=false;clearInterval(timer);};},[refresh]);
 async function perform(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();await refresh();}catch(e){setError(e instanceof Error?e.message:'CCIP operation failed.');}finally{lock.current=false;setBusy(false);}}
 const update=(key:keyof typeof initial,value:string)=>{setFields(f=>({...f,[key]:value}));setReviewed(false);};
 return <section className="panel chain-panel" id="ccip-panel"><div className="panel-heading"><div><h2>{t('Cross-chain tasks','跨链任务')}</h2><p>{t('Authorize on A, execute within B’s budget, then confirm the result.','A 链授权，B 链预算内执行，回传并确认结果。')}</p></div></div><div className="chain-body">
 <p className="form-note">{t('Local test assets. Funds stay in separate Vaults. Pending messages keep their budget; cancelling cannot reverse a completed payment.','仅使用本地测试资产，两链资金分别托管。消息未决时保留预算；取消不能撤回已完成的付款。')}</p>
 <DraftForm storageKey={scope+':ccip-draft'} onRestore={saved=>{setFields({...initial,...Object.fromEntries(Object.keys(initial).filter(k=>saved[k]!==undefined).map(k=>[k,saved[k]]))});setReviewed(false);}} onSubmit={event=>{event.preventDefault();if(!reviewed)return;void perform(async()=>{
  const records=JSON.parse(fields.records) as {block:number}[];
  const payload={title:fields.title,budgetCents:Math.round(Number(fields.budget)*100),durationSeconds:Number(fields.duration),scenario:fields.scenario,approved:true as const,input:{dataset:'custom-transfers-v1' as const,blockFrom:Math.min(...records.map(r=>r.block)),blockTo:Math.max(...records.map(r=>r.block)),records}};
  const intent=await submissionIntent(scope,'ccip',payload,sessionStorage),draft=ccipDraftSchema.parse({...payload,requestId:intent.id});await client.current.create(draft);intent.acknowledge();setReviewed(false);
 });}}>
 <div className="form-grid"><label className="field">{t('Task title','任务名称')}<input name="title" value={fields.title} maxLength={120} required readOnly={busy} onChange={e=>update('title',e.target.value)}/></label><label className="field">{t('Budget · local test token','预算 · 本地测试代币')}<input name="budget" type="number" min="0.01" max="3" step="0.01" required value={fields.budget} readOnly={busy} onChange={e=>update('budget',e.target.value)}/></label><label className="field">{t('Deadline · seconds','期限 · 秒')}<input name="duration" type="number" min="60" max="3600" required value={fields.duration} readOnly={busy} onChange={e=>update('duration',e.target.value)}/></label><label className="field">{t('Local delivery scenario','本地交付场景')}<input type="hidden" name="scenario" value={fields.scenario}/><select value={fields.scenario} disabled={busy} onChange={e=>update('scenario',e.target.value)}><option value="success">{t('Correct delivery','正确交付')}</option><option value="invalid-delivery">{t('Invalid delivery / refund','错误交付 / 退款')}</option></select></label></div>
 <label className="field">{t('Transfer records · JSON, 1–25 entries','转账记录 · JSON，1–25 条')}<textarea name="records" rows={6} maxLength={12000} value={fields.records} readOnly={busy} onChange={e=>update('records',e.target.value)}/></label>
 <label className="skill-permission"><input type="checkbox" aria-label={t('Approve cross-chain task','审核并授权跨链任务')} checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/><span>{t('I reviewed these records, budget and deadline. Authorize this local task.','我已审核以上记录、预算和期限，授权本次本地任务。')}</span></label><button className="btn primary" disabled={busy||!reviewed}>{t('Submit cross-chain task','提交跨链任务')}</button>
 </DraftForm>
 {error&&<p role="alert">{error}</p>}<button className="text-button" disabled={busy} onClick={()=>void perform(async()=>{})}>{t('Refresh cross-chain tasks','刷新跨链任务')}</button>
 {jobs.map(job=><article className="chain-proof" key={job.id} data-ccip-id={job.id}><h3>{job.draft.title}</h3><p data-testid="ccip-status">{t('Status','状态')}: {job.status}</p><p>{t('Reserved','预留')}: {(job.reservedCents/100).toFixed(2)} · {t('Expires','到期')}: {new Date(job.expiresAt).toLocaleString()}</p><p>{t('A authorization / B execution','A 链授权 / B 链执行')}: {job.evidence?.aPhase??0} / {job.evidence?.bPhase??0}</p>{job.lastError&&<p role="status">{job.lastError}</p>}
 {!ccipTerminal(job)&&<div className="chain-actions"><button className="btn secondary small" disabled={busy||job.cancelRequested} onClick={()=>void perform(async()=>{await client.current.control(job.id,'cancel');})}>{t('Cancel cross-chain task','取消跨链任务')}</button><button className="btn secondary small" disabled={busy} onClick={()=>void perform(async()=>{await client.current.control(job.id,'recover');})}>{t('Recover cross-chain task','恢复跨链任务')}</button></div>}
 <details><summary>{t('Cross-chain evidence','跨链证据')}</summary><pre className="artifact-json">{JSON.stringify({id:job.id,chainTaskId:job.chainTaskId,termsHash:job.termsHash,deployment:job.deployment,evidence:job.evidence},null,2)}</pre></details></article>)}
 </div></section>;
}
