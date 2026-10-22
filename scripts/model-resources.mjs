/** Additive requests and expiring inference leases, serialized with process changes. */
export function createModelResources(manager,{now=Date.now,idleMs=300000,leaseMs=120000}={}){
 const wanted=new Set(),leases=new Map(),touched=new Map();let serial=Promise.resolve();
 function expire(){for(const [id,l]of leases)if(l.until<=now())leases.delete(id);}
 async function change(action,model,leaseId){
  expire();
  if(action==='start'){wanted.add(model);touched.set(model,now());}
  else if(action==='acquire'&&manager.owned().includes(model)){const old=leases.get(leaseId);if(old&&old.model!==model)throw Error('Model lease changed.');leases.set(leaseId,{model,until:now()+leaseMs});touched.set(model,now());}
  else if(action==='release'){const old=leases.get(leaseId);if(old){touched.set(old.model,now());leases.delete(leaseId);}}
  else if(action==='stop'){if(model)wanted.delete(model);else wanted.clear();}
  if(action==='idle')for(const name of wanted)if(now()-(touched.get(name)??0)>=idleMs)wanted.delete(name);
  await manager.ensure([...new Set([...wanted,...[...leases.values()].map(l=>l.model)])]);
  return {owned:manager.owned(),activeLeases:leases.size,deferredRelease:[...leases.values()].map(l=>l.model)};
 }
 return {apply(action,model,leaseId){const next=serial.then(()=>change(action,model,leaseId));serial=next.catch(()=>{});return next;},snapshot:()=>({owned:manager.owned(),activeLeases:leases.size})};
}
