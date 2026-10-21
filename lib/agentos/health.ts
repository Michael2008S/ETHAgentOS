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
