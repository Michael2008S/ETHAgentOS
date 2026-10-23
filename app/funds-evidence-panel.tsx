'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLanguage} from '@/lib/i18n/context';
import type {fundsEvidence} from '@/lib/agentos/funds-evidence';
type Snapshot=ReturnType<typeof fundsEvidence>&{scope:string;revision:number;observedAt:string;unavailable:string[];balances:{pool:string;chainId:number;asset:string;vault:string;balance:string;decimals:number;reserved?:string;blockNumber:string;blockHash:string}[]};
export function FundsEvidencePanel({scope}:{scope:string}){
 const {language,tr}=useLanguage(),t=(en:string,zh:string)=>language==='zh-CN'?zh:en,[data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const refresh=useCallback(()=>fetch('/api/funds',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Funds evidence unavailable');const next:Snapshot=await r.json();if(next.scope!==scope)throw Error('Workspace changed');return next;}).then(next=>{setData(next);setError('');}).catch(e=>{setError(e instanceof Error?e.message:'Funds evidence unavailable');}).finally(()=>setBusy(false)),[scope]);
 useEffect(()=>{void refresh();},[refresh]);
 const labels={escrow:t('User escrow','用户托管'),ccip:t('CCIP authorization','CCIP 授权'),'supplier-token':t('Supplier procurement','供应商采购'),'supplier-gas':t('Supplier gas','供应商 gas'),'plugin-escrow':t('Plugin escrow','插件托管'),'future-authorization':t('Future purchase allowance','未来采购授权'),'wallet-escrow':t('Saved wallet escrow','已保存的钱包托管')};
 return <section className="panel chain-panel" id="funds-evidence-panel" style={{overflowWrap:'anywhere'}}><div className="panel-heading"><div><h2>{t('Funds and pending evidence','资金与未决证据')}</h2><p>{t('Each asset and funding responsibility is shown separately.','分别查看每种资产与资金责任。')}</p></div><button className="btn secondary small" disabled={busy} onClick={()=>{setBusy(true);void refresh();}}>{t('Refresh funds evidence','刷新资金证据')}</button></div><div className="chain-body">
 <p className="form-note">{t('Workspace records are saved checkpoints. Shared Vault balances are live observations, not your withdrawable allowance. Unknown costs are never zero.','工作区记录是已保存的检查点。共享 Vault 余额是实时观测，不代表本工作区可提现额度。未知成本不等于零。')}</p>
 {error&&<p role="alert">{error}</p>}{data&&<><p>{t('Observed','观测时间')}: {new Date(data.observedAt).toLocaleString()} · {t('Workspace revision','工作区版本')}: {data.revision}</p>
 <p>{t('Sandbox credits','沙盒积分')}: {t('Available','可用')} {(data.sandbox.available/100).toFixed(2)} · {t('Reserved','预留')} {(data.sandbox.reserved/100).toFixed(2)} · {t('Spent','已支出')} {(data.sandbox.spent/100).toFixed(2)}</p>
 {data.balances.map(b=><details className="chain-proof" key={b.pool}><summary>{t('Shared Vault','共享 Vault')} · {b.pool} · {b.chainId}</summary><p>{t('Balance · atomic units','余额 · 最小单位')}: {b.balance} ({b.decimals} decimals)</p>{b.reserved!==undefined&&<p>{t('Lane reserved · atomic units','通道预留 · 最小单位')}: {b.reserved}</p>}<pre className="artifact-json">{JSON.stringify(b,null,2)}</pre></details>)}
 {data.unavailable.length>0&&<p role="status">{t('Unavailable; do not infer zero','不可用，不按零处理')}: {data.unavailable.join(', ')}</p>}
 {data.records.length===0&&<p>{t('No funding records in this workspace.','本工作区暂无资金记录。')}</p>}
 {data.records.map(r=><article className="chain-proof" key={r.pool+':'+r.id} data-funds-id={r.pool+':'+r.id}><h3>{labels[r.pool]}</h3><p>{r.id} · {r.status}</p><p>{t('Chain','链')}: {r.chainId} · {t('Asset','资产')}: <code>{r.asset}</code></p><p>{t('Amount','金额')}: {r.amount??t('Unknown','未知')} · {t('Reserved','预留')}: {r.reserved??t('Unknown','未知')} ({r.unit})</p><p>{tr(r.reason)}</p><details><summary>{t('Saved evidence','已保存证据')}</summary><pre className="artifact-json">{JSON.stringify(r,null,2)}</pre></details></article>)}
 </>}
 </div></section>;
}
