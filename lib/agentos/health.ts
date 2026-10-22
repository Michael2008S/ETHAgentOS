export type ServiceState='healthy'|'unavailable'|'not-configured'|'stale'|'busy'|'unchecked';
export type RuntimeHealth={checkedAt:string;ready:boolean;services:Record<string,ServiceState>;queue:Record<string,number>;lastConsumerAt:string|null;oldestPendingAt:string|null};
export function consumerState(record:{last_seen:number;status:string;interval_ms?:number}|null,now=Date.now()):ServiceState {
  if(!record)return 'unavailable';
  const age=now-record.last_seen;
  if(age<0)return 'stale';
  if(record.status==='busy'&&age<=120000)return 'busy';
  const interval=Number.isSafeInteger(record.interval_ms)&&record.interval_ms!>=1000&&record.interval_ms!<=60000?record.interval_ms!:2000;
  if(age>Math.max(15000,interval*3))return 'stale';
  return record.status==='ready'?'healthy':record.status==='failed'?'unavailable':'stale';
}

/** An empty window is a successful scan; a stopped finalized head is not fresh data. */
export function monitorSourceState(monitors:import('./usdc-monitor-state.ts').USDCMonitor[],now=Date.now()):ServiceState{
 const active=monitors.filter(m=>m.status==='running');if(!active.length)return 'unchecked';
 if(active.some(m=>m.sourceFailures))return 'unavailable';
 if(active.some(m=>!m.lastSuccessfulScanAt))return 'unchecked';
 if(active.some(m=>{const age=now-Date.parse(m.lastSuccessfulScanAt!);return age<0||age>Math.max(120000,m.draft.pollSeconds*4000)||!!m.finalizedAdvancedAt&&now-Date.parse(m.finalizedAdvancedAt)>1200000;}))return 'stale';
 return 'healthy';
}
