// A submission is acknowledged only when its response arrives. Network retries
// keep the original identity, including across a page reload in this tab.
const pending = new Map<string,string>();
export async function submissionIntent(scope:string,kind:string,payload:unknown,storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>) {
  if(!scope)throw new Error('Workspace is not ready. Refresh before submitting.');
  const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)])):value;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalize(payload))));
  const key='agentos.intent.v1:'+scope+':'+kind+':'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  let id=pending.get(key);
  try{id??=storage?.getItem(key)??undefined;}catch{}
  if(!id||! /^[0-9a-f-]{36}$/.test(id))id=crypto.randomUUID();
  pending.set(key,id);try{storage?.setItem(key,id);}catch{}
  return {id,acknowledge(){pending.delete(key);try{storage?.removeItem(key);}catch{}}};
}
