import {renewalSnapshot} from '../lib/agentos/usdc-monitor-renewal.ts';
import {canonical} from '../cre/workflow/verify.ts';
import {verifyMonitor,usdcMonitorDraftSchema,type USDCMonitor,type USDCMonitorDraft} from '../lib/agentos/usdc-monitor-state.ts';
export class AgentUSDCMonitorClient{
 readonly scope:string;readonly baseURL:string;readonly headers:Record<string,string>;
 constructor(scope:string,baseURL='',headers:Record<string,string>={}){this.scope=scope;this.baseURL=baseURL;this.headers=headers;}
 private async call(body?:unknown,id?:string){const r=await fetch(this.baseURL+'/api/usdc-monitors'+(id?'?id='+encodeURIComponent(id):''),{method:body?'POST':'GET',credentials:'include',headers:{'Content-Type':'application/json',...this.headers},...(body?{body:JSON.stringify(body)}:{})}),value=await r.json() as {scope:string;error?:string;monitor:USDCMonitor;monitors?:USDCMonitor[];renewal?:Awaited<ReturnType<typeof import('../lib/agentos/usdc-monitor-renewal.ts').monitorRenewalPreview>>};if(!r.ok)throw Error(value.error??'USDC monitoring unavailable.');if(value.scope!==this.scope)throw Error('Monitor scope changed.');for(const m of value.monitors??(value.monitor?[value.monitor]:[])){if(m.scope!==this.scope)throw Error('Monitor belongs to another workspace.');await verifyMonitor(m);}return value as unknown as {monitor:USDCMonitor;monitors:USDCMonitor[];renewal:Awaited<ReturnType<typeof import('../lib/agentos/usdc-monitor-renewal.ts').monitorRenewalPreview>>};}
 async list(){return (await this.call()).monitors;}
 async get(id:string){const m=(await this.call(undefined,id)).monitor;if(m.id!==id)throw Error('Monitor identifier differs.');return m;}
 async create(raw:USDCMonitorDraft){const draft=usdcMonitorDraftSchema.parse(raw),m=(await this.call({action:'create',scope:this.scope,draft})).monitor;if(m.id!=='usdc-monitor-'+draft.requestId||canonical(m.draft)!==canonical(draft))throw Error('Monitor differs from the reviewed proposal.');return m;}
 async renewal(id:string){const r=(await this.call({action:'renew-preview',scope:this.scope,id})).renewal,m=await this.get(id);if(r.sourceId!==id||r.snapshotHash!==await renewalSnapshot(m)||r.cursor!==m.cursor||r.account!==m.draft.account)throw Error('Renewal source differs.');return r;}
 async control(id:string,action:'pause'|'resume'|'stop'|'recover'){const m=(await this.call({action,scope:this.scope,id})).monitor;if(m.id!==id)throw Error('Monitor identifier differs.');return m;}
}
