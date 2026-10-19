export type ServiceState='healthy'|'unavailable'|'not-configured'|'stale'|'busy'|'unchecked';
export type RuntimeHealth={checkedAt:string;ready:boolean;services:Record<string,ServiceState>;queue:Record<string,number>;lastConsumerAt:string|null;oldestPendingAt:string|null};
export function consumerState(record:{last_seen:number;status:string}|null,now=Date.now()):ServiceState {
  if(!record)return 'unavailable';
  const age=now-record.last_seen;
  if(record.status==='busy'&&age<=120000)return 'busy';
  return age<=15000&&record.status==='ready'?'healthy':'stale';
}
