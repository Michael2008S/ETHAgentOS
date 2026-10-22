/** Shared bounded inference lease/attempt mechanics for business and JSON repair. */
export type RepairStatus='armed'|'waiting'|'running'|'proposed'|'blocked'|'exhausted'|'cancelled'|'expired'|'completed';
export type RepairAttempt={number:number;requestId:string;token:string;leaseUntil:string;startedAt:string};
export type RepairHistory={number:number;requestId:string;startedAt:string;finishedAt:string;outcome:'proposed'|'failed'|'lease-expired'|'cancelled';code?:string;planId?:string};
export type RepairControl={status:RepairStatus;attempts:number;parameters:{maxAttempts:number};expiresAt:string;history:RepairHistory[];lease?:RepairAttempt;notBefore?:string;proposalId?:string;reason?:string};
export function consistentRepairControl(p:RepairControl){return ['armed','waiting','running','proposed','blocked','exhausted','cancelled','expired','completed'].includes(p.status)&&p.history.length+(p.lease?1:0)===p.attempts&&new Set(p.history.map(h=>h.number)).size===p.history.length&&!p.history.some(h=>h.number<1||h.number>p.attempts)&&(!p.lease||p.lease.number===p.attempts&&p.status==='running'&&p.lease.leaseUntil<=p.expiresAt);}
export function claimRepairControl<T extends RepairControl>(p:T,token:string,requestId:string,leaseMs:number,now:string):T{
 if(!['armed','waiting'].includes(p.status)||p.lease||p.notBefore&&p.notBefore>now||p.expiresAt<=now||p.attempts>=p.parameters.maxAttempts)return p;
 const next=structuredClone(p);next.attempts++;next.status='running';next.lease={number:next.attempts,token,requestId,startedAt:now,leaseUntil:new Date(Math.min(Date.parse(now)+leaseMs,Date.parse(next.expiresAt))).toISOString()};delete next.notBefore;delete next.reason;return next;
}
export function finishRepairControl<T extends RepairControl>(p:T,token:string,outcome:RepairHistory['outcome'],code:string|undefined,planId:string|undefined,now:string):T{
 if(p.status!=='running'||p.lease?.token!==token)return p;
 const next=structuredClone(p),attempt=next.lease!;next.history.push({number:attempt.number,requestId:attempt.requestId,startedAt:attempt.startedAt,finishedAt:now,outcome,...(code?{code}:{}),...(planId?{planId}:{})});delete next.lease;
 next.status=next.expiresAt<=now?'expired':outcome==='proposed'?'proposed':next.attempts>=next.parameters.maxAttempts?'exhausted':'waiting';next.reason=code;if(planId)next.proposalId=planId;if(next.status==='waiting')next.notBefore=new Date(Date.parse(now)+Math.min(60000,1000*2**next.attempts)).toISOString();else delete next.notBefore;return next;
}
