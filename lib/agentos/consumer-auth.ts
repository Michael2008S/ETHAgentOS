import {DomainError} from './engine.ts';
import {isLoopback,CONSUMER_HEADER} from './auth.ts';
export {CONSUMER_HEADER} from './auth.ts';
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type CredentialRow={id:string;owner_id:string;name:string;secret_hash:string;created_at:number;expires_at:number;revoked_at:number|null;last_used_at:number|null;interval_ms:number};
export type ConsumerCredential={id:string;name:string;createdAt:string;expiresAt:string;revokedAt:string|null;lastUsedAt:string|null;intervalMs:number};
const publicCredential=(row:CredentialRow):ConsumerCredential=>({id:row.id,name:row.name,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),revokedAt:row.revoked_at===null?null:new Date(row.revoked_at).toISOString(),lastUsedAt:row.last_used_at===null?null:new Date(row.last_used_at).toISOString(),intervalMs:row.interval_ms});
async function hash(token:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
function same(a:string,b:string){let difference=a.length^b.length;for(let i=0;i<64;i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
export async function listConsumers(database:D1Database,ownerId:string){const rows=await database.prepare('SELECT * FROM agentos_consumer_credentials WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(ownerId).all<CredentialRow>();return rows.results.map(publicCredential);}
export async function issueConsumer(database:D1Database,ownerId:string,input:{id:string;name:string;ttlSeconds:number;intervalMs:number},now=Date.now()){
 if(!idPattern.test(input.id)||!input.name.trim()||input.name.trim().length>60||!Number.isSafeInteger(input.ttlSeconds)||input.ttlSeconds<3600||input.ttlSeconds>2592000||!Number.isSafeInteger(input.intervalMs)||input.intervalMs<1000||input.intervalMs>60000)throw new DomainError('Invalid consumer name, expiry or interval.');
 const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join(''),token='aos_rt_'+input.id+'.'+secret;
 const row:CredentialRow={id:input.id,owner_id:ownerId,name:input.name.trim(),secret_hash:await hash(token),created_at:now,expires_at:now+input.ttlSeconds*1000,revoked_at:null,last_used_at:null,interval_ms:input.intervalMs};
 const result=await database.prepare(`INSERT INTO agentos_consumer_credentials(id,owner_id,name,secret_hash,created_at,expires_at,revoked_at,last_used_at,interval_ms)
 SELECT ?,?,?,?,?,?,NULL,NULL,? WHERE (SELECT COUNT(*) FROM agentos_consumer_credentials WHERE owner_id=? AND revoked_at IS NULL AND expires_at>?)<5 ON CONFLICT(id) DO NOTHING`).bind(row.id,row.owner_id,row.name,row.secret_hash,row.created_at,row.expires_at,row.interval_ms,ownerId,now).run();
 if(result.meta.changes!==1)throw new DomainError('Consumer credential already issued or active credential limit reached. Revoke an old credential before issuing a new one.','CONFLICT');
 return {credential:publicCredential(row),token};
}
export async function revokeConsumer(database:D1Database,ownerId:string,id:string,now=Date.now()){
 if(!idPattern.test(id))throw new DomainError('Invalid consumer identifier.');
 const result=await database.prepare('UPDATE agentos_consumer_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=?').bind(now,id,ownerId).run();
 if(result.meta.changes!==1)throw new DomainError('Consumer credential not found.','NOT_FOUND');
}
/** This credential authenticates only the two service routes, never owner APIs. */
export async function authenticateConsumer(request:Request,database:D1Database,now=Date.now()){
 const url=new URL(request.url),allowed=request.method==='POST'&&url.pathname==='/api/runtime/drain'||request.method==='GET'&&url.pathname==='/api/runtime/consumer-status';
 if(!allowed||url.search||!(url.protocol==='https:'||url.protocol==='http:'&&isLoopback(url))||request.headers.has('origin')||request.headers.has('x-agentos-sandbox'))throw new DomainError('Consumer requests require a fixed server-to-server endpoint.','FORBIDDEN');
 const token=request.headers.get(CONSUMER_HEADER)??'',match=/^aos_rt_([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(token);
 if(!match||!idPattern.test(match[1]))throw new DomainError('Consumer credential is invalid or inactive.','UNAUTHORIZED');
 const row=await database.prepare('SELECT * FROM agentos_consumer_credentials WHERE id=?').bind(match[1]).first<CredentialRow>();
 if(!row||row.revoked_at!==null||row.expires_at<=now||!same(await hash(token),row.secret_hash))throw new DomainError('Consumer credential is invalid or inactive.','UNAUTHORIZED');
 // Recheck revocation/expiry atomically before granting this request. An in-flight
 // request may finish; revocation denies subsequent requests, not mined payments.
 const result=await database.prepare('UPDATE agentos_consumer_credentials SET last_used_at=? WHERE id=? AND revoked_at IS NULL AND expires_at>?').bind(now,row.id,now).run();
 if(result.meta.changes!==1)throw new DomainError('Consumer credential is invalid or inactive.','UNAUTHORIZED');
 return {ownerId:row.owner_id,credential:publicCredential({...row,last_used_at:now})};
}
